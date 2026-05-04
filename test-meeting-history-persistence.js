/**
 * Test script to verify meeting history persistence across server restarts
 * 
 * This test:
 * 1. Creates test data with meeting history
 * 2. Verifies loadUsersFromDisk() restores meeting history
 * 3. Simulates saveUsersToDisk() adding new history entries
 * 4. Verifies the file includes meetingHistory fields
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'user.json');
const TEST_BACKUP = path.join(DATA_DIR, 'user.backup.json');

// Helper functions (copied from server.js)
const meetingHistoryByUser = new Map();
const usersById = new Map();
const usersByEmail = new Map();

function ensureUsersFileExists() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]\n", "utf8");
  }
}

function sanitizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function sanitizeDisplayName(username) {
  if (typeof username !== 'string') return '';
  const cleaned = username.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.length > 24) return '';
  return cleaned;
}

function listForUser(map, userId) {
  if (!map.has(userId)) {
    map.set(userId, []);
  }
  return map.get(userId);
}

function loadUsersFromDisk() {
  ensureUsersFileExists();
  let rawUsers = [];
  try {
    const fileContents = fs.readFileSync(USERS_FILE, 'utf8');
    const parsedUsers = JSON.parse(fileContents);
    rawUsers = Array.isArray(parsedUsers) ? parsedUsers : [];
  } catch (error) {
    console.error('Failed to load users:', error);
    rawUsers = [];
  }

  usersByEmail.clear();
  usersById.clear();
  meetingHistoryByUser.clear();

  for (const user of rawUsers) {
    if (!user || typeof user !== 'object') continue;
    if (!user.id || !user.email || !user.passwordHash) continue;

    const normalizedUser = {
      id: String(user.id),
      email: sanitizeEmail(String(user.email)),
      displayName: sanitizeDisplayName(String(user.displayName || '')),
      passwordHash: String(user.passwordHash),
      createdAt: Number.isFinite(Number(user.createdAt)) ? Number(user.createdAt) : Date.now(),
    };

    if (!normalizedUser.email || !normalizedUser.displayName) continue;

    usersByEmail.set(normalizedUser.email, normalizedUser);
    usersById.set(normalizedUser.id, normalizedUser);

    // Restore meeting history for this user
    if (Array.isArray(user.meetingHistory) && user.meetingHistory.length > 0) {
      meetingHistoryByUser.set(normalizedUser.id, user.meetingHistory);
    }
  }
}

function saveUsersToDisk() {
  ensureUsersFileExists();
  const users = Array.from(usersById.values())
    .map(user => ({
      ...user,
      meetingHistory: meetingHistoryByUser.get(user.id) || []
    }))
    .sort((left, right) => left.createdAt - right.createdAt);
  fs.writeFileSync(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
}

// Test execution
console.log('\n=== MEETING HISTORY PERSISTENCE TEST ===\n');

try {
  // Backup existing user.json
  if (fs.existsSync(USERS_FILE)) {
    fs.copyFileSync(USERS_FILE, TEST_BACKUP);
    console.log('✓ Backed up existing user.json');
  }

  // Step 1: Create test data
  console.log('\nStep 1: Creating test data with meeting history...');
  const testUserId = 'test-user-' + Date.now();
  const testUser = {
    id: testUserId,
    email: 'test@example.com',
    displayName: 'Test User',
    passwordHash: '$2a$12$test',
    createdAt: Date.now() - 86400000, // 1 day ago
    meetingHistory: [
      {
        id: 'meeting-1',
        roomId: 'ROOM-001',
        title: 'Team Standup',
        joinedAt: Date.now() - 3600000,
        leftAt: Date.now() - 1800000,
        durationMs: 1800000
      },
      {
        id: 'meeting-2',
        roomId: 'ROOM-002',
        title: 'Project Review',
        joinedAt: Date.now() - 7200000,
        leftAt: Date.now() - 5400000,
        durationMs: 1800000
      }
    ]
  };
  
  fs.writeFileSync(USERS_FILE, JSON.stringify([testUser], null, 2) + '\n');
  console.log('✓ Test data written to user.json');

  // Step 2: Load from disk
  console.log('\nStep 2: Loading users from disk...');
  loadUsersFromDisk();
  
  const loadedUser = usersById.get(testUserId);
  if (loadedUser) {
    console.log('✓ User loaded:', loadedUser.displayName);
  } else {
    console.error('✗ Failed to load user');
    process.exit(1);
  }

  // Step 3: Verify history was restored
  console.log('\nStep 3: Verifying meeting history was restored...');
  const restoredHistory = meetingHistoryByUser.get(testUserId);
  if (restoredHistory && restoredHistory.length === 2) {
    console.log('✓ Meeting history restored:', restoredHistory.length, 'meetings');
    restoredHistory.forEach((m, i) => {
      console.log(`  - Meeting ${i+1}: ${m.title} (${m.durationMs}ms)`);
    });
  } else {
    console.error('✗ Failed to restore meeting history');
    process.exit(1);
  }

  // Step 4: Add new meeting via API
  console.log('\nStep 4: Simulating new meeting history entry...');
  const newHistory = listForUser(meetingHistoryByUser, testUserId);
  newHistory.unshift({
    id: 'meeting-3',
    roomId: 'ROOM-003',
    title: 'New Meeting Added',
    joinedAt: Date.now(),
    leftAt: Date.now() + 1800000,
    durationMs: 1800000
  });
  console.log('✓ New meeting entry added to memory');

  // Step 5: Save to disk
  console.log('\nStep 5: Saving updated history to disk...');
  saveUsersToDisk();
  console.log('✓ User data saved to disk');

  // Step 6: Verify file contains meetingHistory
  console.log('\nStep 6: Verifying file structure...');
  const savedContent = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  const savedUser = savedContent[0];
  
  if (savedUser.meetingHistory && Array.isArray(savedUser.meetingHistory)) {
    console.log('✓ meetingHistory field exists in user.json');
    console.log(`✓ Total meetings saved: ${savedUser.meetingHistory.length}`);
    savedUser.meetingHistory.forEach((m, i) => {
      console.log(`  - ${i+1}. ${m.title} (Room: ${m.roomId})`);
    });
  } else {
    console.error('✗ meetingHistory field not found in saved user data');
    process.exit(1);
  }

  // Step 7: Simulate server restart by reloading
  console.log('\nStep 7: Simulating server restart (reloading from disk)...');
  usersByEmail.clear();
  usersById.clear();
  meetingHistoryByUser.clear();
  
  loadUsersFromDisk();
  
  const reloadedUser = usersById.get(testUserId);
  const reloadedHistory = meetingHistoryByUser.get(testUserId);
  
  if (reloadedHistory && reloadedHistory.length === 3) {
    console.log('✓ Meeting history persisted across restart!');
    console.log(`✓ Total meetings after restart: ${reloadedHistory.length}`);
    reloadedHistory.forEach((m, i) => {
      console.log(`  - ${i+1}. ${m.title}`);
    });
  } else {
    console.error('✗ Meeting history not persisted correctly');
    process.exit(1);
  }

  console.log('\n✓✓✓ ALL TESTS PASSED ✓✓✓\n');
  console.log('Meeting history persistence is working correctly!');
  console.log('Users and their meeting history will now persist across server restarts.\n');

  // Restore original file
  if (fs.existsSync(TEST_BACKUP)) {
    fs.copyFileSync(TEST_BACKUP, USERS_FILE);
    fs.unlinkSync(TEST_BACKUP);
    console.log('Restored original user.json');
  }

} catch (error) {
  console.error('\n✗ TEST FAILED:', error.message);
  
  // Restore backup
  if (fs.existsSync(TEST_BACKUP)) {
    fs.copyFileSync(TEST_BACKUP, USERS_FILE);
    fs.unlinkSync(TEST_BACKUP);
    console.log('Restored original user.json from backup');
  }
  process.exit(1);
}
