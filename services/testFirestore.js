const { db } = require('./firebaseAdmin');

async function test() {
  try {
    const snapshot = await db.collection('communityPosts').limit(1).get();
    console.log('Firestore test success:', snapshot.size);
  } catch (err) {
    console.error('Firestore test failed:', err);
  }
}

test();
