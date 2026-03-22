#!/usr/bin/env python3
"""
CacheGPT Growth Agent — Structured Logger

Utility for the growth agent to log opportunities in a consistent JSONL format.
Can be called from the agent's skill or used standalone to manually log entries.

Usage:
  # Log a new opportunity
  python3 growth-logger.py log \
    --post-id "abc123" \
    --subreddit "r/LocalLLaMA" \
    --title "My API bill is insane" \
    --url "https://reddit.com/r/LocalLLaMA/comments/abc123" \
    --author "u/username" \
    --score 8 \
    --age-hours 4.2 \
    --comments 12 \
    --keywords "API bill,reduce costs" \
    --sentiment "frustrated, seeking solutions" \
    --draft "I ran into the same thing last month..."

  # Log without a draft (low-score opportunity)
  python3 growth-logger.py log \
    --post-id "def456" \
    --subreddit "r/webdev" \
    --title "AI costs discussion" \
    --url "https://reddit.com/..." \
    --score 4

  # Show recent entries
  python3 growth-logger.py recent

  # Show stats
  python3 growth-logger.py stats
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_LOG_DIR = os.path.expanduser("~/openclaw-server/logs/growth")
DEFAULT_LOG_FILE = os.path.join(DEFAULT_LOG_DIR, "growth-opportunities.jsonl")
DEFAULT_SEEN_FILE = os.path.join(DEFAULT_LOG_DIR, "seen-posts.json")


def ensure_log_dir():
    """Create log directory if it doesn't exist."""
    os.makedirs(DEFAULT_LOG_DIR, exist_ok=True)


def load_seen_posts():
    """Load set of already-seen post IDs."""
    if os.path.isfile(DEFAULT_SEEN_FILE):
        try:
            with open(DEFAULT_SEEN_FILE, 'r') as f:
                return set(json.load(f))
        except (json.JSONDecodeError, OSError):
            return set()
    return set()


def save_seen_posts(seen):
    """Save seen post IDs."""
    ensure_log_dir()
    with open(DEFAULT_SEEN_FILE, 'w') as f:
        json.dump(list(seen), f)


def log_opportunity(args):
    """Log a single opportunity to the JSONL file."""
    ensure_log_dir()

    # Check for duplicates
    seen = load_seen_posts()
    if args.post_id and args.post_id in seen:
        print(json.dumps({"status": "duplicate", "post_id": args.post_id}))
        return

    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "post_id": args.post_id or f"manual_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "subreddit": args.subreddit or "unknown",
        "title": args.title or "",
        "url": args.url or "",
        "author": args.author or "unknown",
        "score": args.score or 0,
        "age_hours": args.age_hours or 0,
        "comment_count": args.comments or 0,
        "matched_keywords": [k.strip() for k in args.keywords.split(',')] if args.keywords else [],
        "sentiment": args.sentiment or "",
        "drafted_response": args.draft if args.draft else None,
        "subreddit_flags": args.flags if args.flags else None,
        "reported": False,
    }

    # Append to JSONL
    log_file = args.log_file or DEFAULT_LOG_FILE
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(json.dumps(entry, ensure_ascii=False) + '\n')

    # Update seen posts
    if args.post_id:
        seen.add(args.post_id)
        save_seen_posts(seen)

    # Output confirmation
    print(json.dumps({
        "status": "logged",
        "post_id": entry["post_id"],
        "score": entry["score"],
        "has_draft": entry["drafted_response"] is not None,
        "log_file": log_file,
    }))


def show_recent(args):
    """Show the most recent logged entries."""
    log_file = args.log_file or DEFAULT_LOG_FILE
    count = args.count or 10

    if not os.path.isfile(log_file):
        print("No log file found.")
        return

    entries = []
    with open(log_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    # Show last N entries
    for entry in entries[-count:]:
        score = entry.get('score', 0)
        has_draft = '(draft)' if entry.get('drafted_response') else ''
        print(f"  [{score}] {entry.get('subreddit', '?')} — {entry.get('title', '?')[:60]} {has_draft}")
        print(f"      {entry.get('url', '')}")
        print()

    print(f"  Total entries: {len(entries)}")


def show_stats(args):
    """Show aggregate statistics."""
    log_file = args.log_file or DEFAULT_LOG_FILE

    if not os.path.isfile(log_file):
        print("No log file found.")
        return

    entries = []
    with open(log_file, 'r') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    total = len(entries)
    if total == 0:
        print("No entries logged yet.")
        return

    drafted = sum(1 for e in entries if e.get('drafted_response'))
    avg_score = sum(e.get('score', 0) for e in entries) / total
    high_score = sum(1 for e in entries if e.get('score', 0) >= 7)

    seen = load_seen_posts()

    print(f"\n  Growth Agent Stats")
    print(f"  ─────────────────")
    print(f"  Total opportunities: {total}")
    print(f"  With drafts:         {drafted}")
    print(f"  High-score (7+):     {high_score}")
    print(f"  Average score:       {avg_score:.1f}")
    print(f"  Unique posts seen:   {len(seen)}")
    print(f"  Log file:            {log_file}")
    print()


def main():
    parser = argparse.ArgumentParser(description="CacheGPT Growth Logger")
    parser.add_argument('--log-file', type=str, help='Custom log file path')
    subparsers = parser.add_subparsers(dest='command')

    # Log subcommand
    log_parser = subparsers.add_parser('log', help='Log a new opportunity')
    log_parser.add_argument('--post-id', type=str, help='Reddit post ID')
    log_parser.add_argument('--subreddit', type=str, help='Subreddit name')
    log_parser.add_argument('--title', type=str, help='Post title')
    log_parser.add_argument('--url', type=str, help='Post URL')
    log_parser.add_argument('--author', type=str, help='Post author')
    log_parser.add_argument('--score', type=int, help='Opportunity score (1-10)')
    log_parser.add_argument('--age-hours', type=float, help='Post age in hours')
    log_parser.add_argument('--comments', type=int, help='Comment count')
    log_parser.add_argument('--keywords', type=str, help='Matched keywords (comma-separated)')
    log_parser.add_argument('--sentiment', type=str, help='User sentiment')
    log_parser.add_argument('--draft', type=str, help='Drafted response text')
    log_parser.add_argument('--flags', type=str, help='Subreddit flags/warnings')

    # Recent subcommand
    recent_parser = subparsers.add_parser('recent', help='Show recent entries')
    recent_parser.add_argument('--count', type=int, default=10, help='Number of entries to show')

    # Stats subcommand
    subparsers.add_parser('stats', help='Show aggregate statistics')

    args = parser.parse_args()

    if args.command == 'log':
        log_opportunity(args)
    elif args.command == 'recent':
        show_recent(args)
    elif args.command == 'stats':
        show_stats(args)
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
