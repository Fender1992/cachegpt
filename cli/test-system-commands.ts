/**
 * Test comprehensive system command support
 * Tests Docker, systemctl, package managers, and other system tools
 */

import {
  isSafeCommand,
  isDangerousCommand,
  isWarningCommand,
  getSafetyWarning
} from './src/lib/shell-operations';

console.log('=== Testing Comprehensive System Command Support ===\n');

const testCases = [
  // Docker commands
  { cmd: 'docker ps', category: 'Docker', shouldBeSafe: true },
  { cmd: 'docker ps -a', category: 'Docker', shouldBeSafe: true },
  { cmd: 'docker logs mycontainer', category: 'Docker', shouldBeSafe: true },
  { cmd: 'docker exec -it mycontainer bash', category: 'Docker', shouldBeSafe: true },
  { cmd: 'docker-compose up', category: 'Docker', shouldBeSafe: true },

  // Kubernetes
  { cmd: 'kubectl get pods', category: 'Kubernetes', shouldBeSafe: true },
  { cmd: 'kubectl describe service nginx', category: 'Kubernetes', shouldBeSafe: true },
  { cmd: 'helm list', category: 'Kubernetes', shouldBeSafe: true },

  // System services
  { cmd: 'systemctl status nginx', category: 'System Services', shouldBeSafe: true },
  { cmd: 'systemctl list-units', category: 'System Services', shouldBeSafe: true },
  { cmd: 'service apache2 status', category: 'System Services', shouldBeSafe: true },
  { cmd: 'journalctl -u nginx', category: 'System Services', shouldBeSafe: true },

  // Package managers
  { cmd: 'apt list --installed', category: 'Package Managers', shouldBeSafe: true },
  { cmd: 'yum search nginx', category: 'Package Managers', shouldBeSafe: true },
  { cmd: 'brew info node', category: 'Package Managers', shouldBeSafe: true },
  { cmd: 'pip list', category: 'Package Managers', shouldBeSafe: true },
  { cmd: 'cargo build', category: 'Package Managers', shouldBeSafe: true },

  // System information
  { cmd: 'uname -a', category: 'System Info', shouldBeSafe: true },
  { cmd: 'lscpu', category: 'System Info', shouldBeSafe: true },
  { cmd: 'df -h', category: 'System Info', shouldBeSafe: true },
  { cmd: 'free -m', category: 'System Info', shouldBeSafe: true },
  { cmd: 'dmesg | tail', category: 'System Info', shouldBeSafe: true },

  // Networking
  { cmd: 'netstat -tuln', category: 'Networking', shouldBeSafe: true },
  { cmd: 'ss -tuln', category: 'Networking', shouldBeSafe: true },
  { cmd: 'dig google.com', category: 'Networking', shouldBeSafe: true },
  { cmd: 'ping -c 4 google.com', category: 'Networking', shouldBeSafe: true },

  // Process management
  { cmd: 'ps aux', category: 'Processes', shouldBeSafe: true },
  { cmd: 'top -bn1', category: 'Processes', shouldBeSafe: true },
  { cmd: 'htop', category: 'Processes', shouldBeSafe: true },
  { cmd: 'pgrep nginx', category: 'Processes', shouldBeSafe: true },

  // Cloud CLIs
  { cmd: 'aws s3 ls', category: 'Cloud CLIs', shouldBeSafe: true },
  { cmd: 'gcloud projects list', category: 'Cloud CLIs', shouldBeSafe: true },
  { cmd: 'az vm list', category: 'Cloud CLIs', shouldBeSafe: true },

  // Development tools
  { cmd: 'git status', category: 'Development', shouldBeSafe: true },
  { cmd: 'make build', category: 'Development', shouldBeSafe: true },
  { cmd: 'go test ./...', category: 'Development', shouldBeSafe: true },
  { cmd: 'cargo test', category: 'Development', shouldBeSafe: true },

  // Warning commands (system power)
  { cmd: 'shutdown -h now', category: 'Power (Warning)', shouldBeSafe: false, shouldWarn: true },
  { cmd: 'reboot', category: 'Power (Warning)', shouldBeSafe: false, shouldWarn: true },
  { cmd: 'systemctl reboot', category: 'Power (Warning)', shouldBeSafe: false, shouldWarn: true },

  // Dangerous commands (blocked)
  { cmd: 'rm -rf /', category: 'Dangerous (Blocked)', shouldBeSafe: false, shouldBlock: true },
  { cmd: 'mkfs.ext4 /dev/sda', category: 'Dangerous (Blocked)', shouldBeSafe: false, shouldBlock: true },
  { cmd: 'dd if=/dev/zero of=/dev/sda', category: 'Dangerous (Blocked)', shouldBeSafe: false, shouldBlock: true },
];

// Group by category
const categories: { [key: string]: typeof testCases } = {};
testCases.forEach(test => {
  if (!categories[test.category]) {
    categories[test.category] = [];
  }
  categories[test.category].push(test);
});

let totalTests = 0;
let passedTests = 0;

// Test each category
Object.keys(categories).forEach(category => {
  console.log(`\n${category}:`);
  console.log('─'.repeat(50));

  categories[category].forEach(test => {
    totalTests++;
    const isSafe = isSafeCommand(test.cmd);
    const isDangerous = isDangerousCommand(test.cmd);
    const isWarning = isWarningCommand(test.cmd);
    const warning = getSafetyWarning(test.cmd);

    let status = '✓';
    let details = '';

    // Check if test passed
    if (test.shouldBlock && isDangerous) {
      passedTests++;
      details = '❌ BLOCKED';
    } else if (test.shouldWarn && isWarning) {
      passedTests++;
      details = '⚠️  WARNING';
    } else if (test.shouldBeSafe && isSafe) {
      passedTests++;
      details = '✓ SAFE';
    } else {
      status = '✗';
      details = 'FAILED';
      if (!test.shouldBeSafe && !test.shouldBlock && !test.shouldWarn) {
        // Commands that aren't explicitly safe but should still work
        if (!isDangerous) {
          passedTests++;
          status = '✓';
          details = 'ℹ️  NON-STANDARD (allowed)';
        }
      }
    }

    console.log(`  ${status} ${test.cmd.padEnd(40)} ${details}`);
  });
});

console.log('\n' + '='.repeat(50));
console.log(`Results: ${passedTests}/${totalTests} tests passed`);
console.log('='.repeat(50));

if (passedTests === totalTests) {
  console.log('\n✅ All tests passed!\n');
} else {
  console.log(`\n⚠️  ${totalTests - passedTests} tests failed\n`);
}

// Summary of capabilities
console.log('\n📋 Command Category Summary:\n');
Object.keys(categories).forEach(category => {
  const count = categories[category].length;
  console.log(`  ${category.padEnd(30)} ${count} commands`);
});

console.log('\n✨ The CLI now supports comprehensive system management!\n');
