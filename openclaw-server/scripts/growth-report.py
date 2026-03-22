#!/usr/bin/env python3
"""
CacheGPT Growth Agent — Reporting System

Reads growth-opportunities.jsonl and generates reports on:
- All drafted responses with full context
- Opportunity scores, trends, and conversion tracking
- Subreddit breakdown and keyword performance
- Weekly/daily summaries

Usage:
  python3 growth-report.py                    # Full report (last 7 days)
  python3 growth-report.py --days 30          # Last 30 days
  python3 growth-report.py --drafts-only      # Only show drafted responses
  python3 growth-report.py --export csv       # Export to CSV
  python3 growth-report.py --export json      # Export clean JSON
  python3 growth-report.py --score-min 7      # Filter by minimum score
  python3 growth-report.py --subreddit LocalLLaMA  # Filter by subreddit
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Log file locations (Docker and local)
LOG_PATHS = [
    "/var/log/openclaw/growth-opportunities.jsonl",
    os.path.expanduser("~/openclaw-server/logs/growth/growth-opportunities.jsonl"),
    os.path.expanduser("~/.openclaw/logs/growth-opportunities.jsonl"),
    "./logs/growth/growth-opportunities.jsonl",
]

# Colors
RED = '\033[0;31m'
GREEN = '\033[0;32m'
YELLOW = '\033[1;33m'
BLUE = '\033[0;34m'
CYAN = '\033[0;36m'
MAGENTA = '\033[0;35m'
BOLD = '\033[1m'
DIM = '\033[2m'
NC = '\033[0m'

# Disable colors if not a terminal
if not sys.stdout.isatty():
    RED = GREEN = YELLOW = BLUE = CYAN = MAGENTA = BOLD = DIM = NC = ''


def find_log_file(custom_path=None):
    """Find the growth opportunities log file."""
    if custom_path and os.path.isfile(custom_path):
        return custom_path

    for path in LOG_PATHS:
        if os.path.isfile(path):
            return path

    return None


def load_opportunities(log_path, days=7, score_min=0, subreddit=None, drafts_only=False):
    """Load and filter opportunities from JSONL log."""
    entries = []
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    try:
        with open(log_path, 'r') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Parse timestamp
                ts_str = entry.get('timestamp', '')
                try:
                    ts = datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=timezone.utc)
                except (ValueError, AttributeError):
                    ts = datetime.now(timezone.utc)
                entry['_parsed_ts'] = ts

                # Apply filters
                if ts < cutoff:
                    continue
                if entry.get('score', 0) < score_min:
                    continue
                if subreddit and entry.get('subreddit', '').lower().replace('r/', '') != subreddit.lower().replace('r/', ''):
                    continue
                if drafts_only and not entry.get('drafted_response'):
                    continue

                entries.append(entry)
    except FileNotFoundError:
        return []

    # Sort by timestamp descending
    entries.sort(key=lambda e: e['_parsed_ts'], reverse=True)
    return entries


def print_header(title):
    """Print a section header."""
    width = 60
    print(f"\n{CYAN}{'═' * width}{NC}")
    print(f"{CYAN}  {title}{NC}")
    print(f"{CYAN}{'═' * width}{NC}\n")


def print_summary(entries):
    """Print overview summary stats."""
    print_header("Summary")

    total = len(entries)
    with_drafts = sum(1 for e in entries if e.get('drafted_response'))
    high_score = sum(1 for e in entries if e.get('score', 0) >= 7)
    avg_score = sum(e.get('score', 0) for e in entries) / total if total else 0

    print(f"  {BOLD}Total opportunities:{NC}  {total}")
    print(f"  {BOLD}With drafted responses:{NC} {with_drafts}")
    print(f"  {BOLD}High-score (7+):{NC}       {high_score}")
    print(f"  {BOLD}Average score:{NC}          {avg_score:.1f}")

    if entries:
        oldest = min(e['_parsed_ts'] for e in entries)
        newest = max(e['_parsed_ts'] for e in entries)
        print(f"  {BOLD}Date range:{NC}            {oldest.strftime('%Y-%m-%d')} to {newest.strftime('%Y-%m-%d')}")


def print_platform_breakdown(entries):
    """Print stats by platform."""
    print_header("Platform Breakdown")

    platform_map = {
        'HackerNews': '🟠 Hacker News',
        'Dev.to': '🟢 Dev.to',
        'StackOverflow': '🟡 Stack Overflow',
        'X/Twitter': '🐦 X/Twitter',
        'IndieHackers': '🟣 Indie Hackers',
    }

    by_platform = defaultdict(lambda: {'total': 0, 'drafted': 0, 'scores': []})

    for e in entries:
        source = e.get('subreddit', 'unknown')
        if source.startswith('r/'):
            platform = '🔵 Reddit'
        elif source.startswith('GitHub/'):
            platform = '⚫ GitHub'
        else:
            platform = platform_map.get(source, f'❓ {source}')

        by_platform[platform]['total'] += 1
        by_platform[platform]['scores'].append(e.get('score', 0))
        if e.get('drafted_response'):
            by_platform[platform]['drafted'] += 1

    sorted_platforms = sorted(by_platform.items(), key=lambda x: x[1]['total'], reverse=True)

    print(f"  {'Platform':<25} {'Total':>6} {'Drafts':>7} {'Avg Score':>10}")
    print(f"  {'─' * 25} {'─' * 6} {'─' * 7} {'─' * 10}")

    for platform, stats in sorted_platforms:
        avg = sum(stats['scores']) / len(stats['scores']) if stats['scores'] else 0
        color = GREEN if avg >= 7 else YELLOW if avg >= 5 else DIM
        print(f"  {color}{platform:<25}{NC} {stats['total']:>6} {stats['drafted']:>7} {avg:>9.1f}")

    print()


def print_subreddit_breakdown(entries):
    """Print stats by source (subreddit/platform)."""
    print_header("Source Breakdown")

    by_sub = defaultdict(lambda: {'total': 0, 'drafted': 0, 'scores': [], 'keywords': set()})

    for e in entries:
        sub = e.get('subreddit', 'unknown')
        by_sub[sub]['total'] += 1
        by_sub[sub]['scores'].append(e.get('score', 0))
        if e.get('drafted_response'):
            by_sub[sub]['drafted'] += 1
        for kw in e.get('matched_keywords', []):
            by_sub[sub]['keywords'].add(kw)

    # Sort by total descending
    sorted_subs = sorted(by_sub.items(), key=lambda x: x[1]['total'], reverse=True)

    print(f"  {'Subreddit':<25} {'Total':>6} {'Drafts':>7} {'Avg Score':>10} {'Top Keywords'}")
    print(f"  {'─' * 25} {'─' * 6} {'─' * 7} {'─' * 10} {'─' * 30}")

    for sub, stats in sorted_subs:
        avg = sum(stats['scores']) / len(stats['scores']) if stats['scores'] else 0
        top_kw = ', '.join(list(stats['keywords'])[:3])
        color = GREEN if avg >= 7 else YELLOW if avg >= 5 else DIM
        print(f"  {color}{sub:<25}{NC} {stats['total']:>6} {stats['drafted']:>7} {avg:>9.1f}  {top_kw}")


def print_keyword_performance(entries):
    """Print keyword hit rates."""
    print_header("Keyword Performance")

    kw_stats = defaultdict(lambda: {'hits': 0, 'scores': [], 'drafted': 0})

    for e in entries:
        for kw in e.get('matched_keywords', []):
            kw_stats[kw]['hits'] += 1
            kw_stats[kw]['scores'].append(e.get('score', 0))
            if e.get('drafted_response'):
                kw_stats[kw]['drafted'] += 1

    sorted_kw = sorted(kw_stats.items(), key=lambda x: x[1]['hits'], reverse=True)

    print(f"  {'Keyword':<30} {'Hits':>5} {'Drafts':>7} {'Avg Score':>10}")
    print(f"  {'─' * 30} {'─' * 5} {'─' * 7} {'─' * 10}")

    for kw, stats in sorted_kw[:20]:
        avg = sum(stats['scores']) / len(stats['scores']) if stats['scores'] else 0
        print(f"  {kw:<30} {stats['hits']:>5} {stats['drafted']:>7} {avg:>9.1f}")


def print_drafted_responses(entries):
    """Print all drafted responses with full context."""
    drafted = [e for e in entries if e.get('drafted_response')]

    print_header(f"Drafted Responses ({len(drafted)} total)")

    if not drafted:
        print(f"  {DIM}No drafted responses in this period.{NC}")
        return

    for i, e in enumerate(drafted, 1):
        score = e.get('score', 0)
        score_color = GREEN if score >= 8 else YELLOW if score >= 6 else RED

        print(f"  {BOLD}#{i}{NC} {score_color}[Score: {score}]{NC} {e.get('subreddit', '?')} — {e.get('title', 'No title')}")
        print(f"  {DIM}URL:{NC} {e.get('url', 'N/A')}")
        print(f"  {DIM}Author:{NC} {e.get('author', '?')} | {DIM}Age:{NC} {e.get('age_hours', '?')}h | {DIM}Comments:{NC} {e.get('comment_count', '?')}")
        print(f"  {DIM}Keywords:{NC} {', '.join(e.get('matched_keywords', []))}")
        print(f"  {DIM}Sentiment:{NC} {e.get('sentiment', 'N/A')}")

        if e.get('subreddit_flags'):
            print(f"  {YELLOW}Flags: {e['subreddit_flags']}{NC}")

        print(f"\n  {BLUE}Draft:{NC}")
        draft = e['drafted_response']
        for line in draft.split('\n'):
            print(f"  {BLUE}│{NC} {line}")

        print(f"\n  {DIM}Logged: {e.get('timestamp', 'N/A')}{NC}")
        print(f"  {'─' * 58}")
        print()


def print_daily_trend(entries):
    """Print daily opportunity trend."""
    print_header("Daily Trend")

    by_day = defaultdict(lambda: {'total': 0, 'drafted': 0, 'high_score': 0})

    for e in entries:
        day = e['_parsed_ts'].strftime('%Y-%m-%d')
        by_day[day]['total'] += 1
        if e.get('drafted_response'):
            by_day[day]['drafted'] += 1
        if e.get('score', 0) >= 7:
            by_day[day]['high_score'] += 1

    sorted_days = sorted(by_day.items())

    print(f"  {'Date':<12} {'Total':>6} {'Drafts':>7} {'Score 7+':>9} {'Bar'}")
    print(f"  {'─' * 12} {'─' * 6} {'─' * 7} {'─' * 9} {'─' * 20}")

    max_total = max((d['total'] for d in by_day.values()), default=1)

    for day, stats in sorted_days:
        bar_len = int((stats['total'] / max_total) * 20) if max_total > 0 else 0
        bar = f"{GREEN}{'█' * bar_len}{NC}"
        print(f"  {day:<12} {stats['total']:>6} {stats['drafted']:>7} {stats['high_score']:>9} {bar}")


def export_csv(entries, output_path):
    """Export opportunities to CSV."""
    fields = [
        'timestamp', 'post_id', 'subreddit', 'title', 'url', 'author',
        'score', 'age_hours', 'comment_count', 'matched_keywords',
        'sentiment', 'drafted_response', 'subreddit_flags', 'reported'
    ]

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        for e in entries:
            row = {k: e.get(k, '') for k in fields}
            if isinstance(row['matched_keywords'], list):
                row['matched_keywords'] = '; '.join(row['matched_keywords'])
            writer.writerow(row)

    print(f"  {GREEN}Exported {len(entries)} entries to {output_path}{NC}")


def export_json(entries, output_path):
    """Export opportunities to clean JSON."""
    # Remove internal fields
    clean = []
    for e in entries:
        entry = {k: v for k, v in e.items() if not k.startswith('_')}
        clean.append(entry)

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(clean, f, indent=2, default=str)

    print(f"  {GREEN}Exported {len(entries)} entries to {output_path}{NC}")


def main():
    parser = argparse.ArgumentParser(
        description="CacheGPT Growth Agent — Reporting System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--days', type=int, default=7, help='Number of days to report on (default: 7)')
    parser.add_argument('--drafts-only', action='store_true', help='Only show entries with drafted responses')
    parser.add_argument('--score-min', type=int, default=0, help='Minimum score filter')
    parser.add_argument('--subreddit', type=str, help='Filter by subreddit (e.g., LocalLLaMA)')
    parser.add_argument('--export', choices=['csv', 'json'], help='Export format')
    parser.add_argument('--output', type=str, help='Export output path')
    parser.add_argument('--log-file', type=str, help='Custom log file path')
    parser.add_argument('--no-drafts', action='store_true', help='Hide drafted response text (summary only)')

    args = parser.parse_args()

    # Find log file
    log_path = find_log_file(args.log_file)

    if not log_path:
        # No log file exists yet — create an empty one and show setup instructions
        default_log = os.path.expanduser("~/openclaw-server/logs/growth/growth-opportunities.jsonl")
        os.makedirs(os.path.dirname(default_log), exist_ok=True)
        Path(default_log).touch()

        print(f"\n  {YELLOW}No growth opportunity logs found yet.{NC}")
        print(f"  {DIM}Created empty log at: {default_log}{NC}")
        print(f"\n  The growth agent will populate this file as it scans Reddit.")
        print(f"  Run this report again after the agent has been active.\n")
        print(f"  {DIM}Searched paths:{NC}")
        for p in LOG_PATHS:
            print(f"    {DIM}• {p}{NC}")
        return

    # Load entries
    entries = load_opportunities(
        log_path,
        days=args.days,
        score_min=args.score_min,
        subreddit=args.subreddit,
        drafts_only=args.drafts_only,
    )

    if not entries:
        print(f"\n  {YELLOW}No opportunities found matching your filters.{NC}")
        print(f"  {DIM}Log file: {log_path}{NC}")
        print(f"  {DIM}Filters: days={args.days}, score_min={args.score_min}, subreddit={args.subreddit}{NC}")
        return

    # Handle exports
    if args.export:
        output_path = args.output or f"growth-report-{datetime.now().strftime('%Y%m%d')}.{args.export}"
        if args.export == 'csv':
            export_csv(entries, output_path)
        elif args.export == 'json':
            export_json(entries, output_path)
        return

    # Print full report
    print(f"\n{BOLD}  CacheGPT Growth Report — Last {args.days} days{NC}")
    print(f"  {DIM}Log: {log_path}{NC}")

    print_summary(entries)
    print_daily_trend(entries)
    print_platform_breakdown(entries)
    print_subreddit_breakdown(entries)
    print_keyword_performance(entries)

    if not args.no_drafts:
        print_drafted_responses(entries)

    print(f"\n  {DIM}Tip: Use --export csv or --export json to save this data{NC}\n")


if __name__ == '__main__':
    main()
