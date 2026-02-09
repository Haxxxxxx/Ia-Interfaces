import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// Find our specific user
const docId = '4a3b8ebd-c652-4078-8d96-4eb01a6eaa58';
const doc = await db.collection('users').doc(docId).get();

if (doc.exists) {
  console.log('FOUND USER!');
  console.log(JSON.stringify(doc.data(), null, 2));
} else {
  console.log('User not found at ID:', docId);

  // Try searching by email
  const query = await db.collection('users').where('email', '==', 'vincent@rodeo.ai').get();
  if (!query.empty) {
    console.log('Found by email:');
    query.docs.forEach(d => console.log(d.id, d.data()));
  } else {
    console.log('Not found by email either');
  }
}
