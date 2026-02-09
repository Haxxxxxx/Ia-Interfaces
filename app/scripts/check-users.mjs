import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

const snapshot = await db.collection('users').get();
snapshot.docs.forEach(doc => {
  const data = doc.data();
  console.log('User ID:', doc.id);
  console.log('Name:', data.name);
  console.log('Fields:', Object.keys(data));
  console.log('Has apiKeyHash:', data.apiKeyHash ? 'YES' : 'NO');
  console.log('apiKeyHash value:', data.apiKeyHash?.substring(0, 20) + '...');
  console.log('---');
});
