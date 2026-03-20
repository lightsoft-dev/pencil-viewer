/**
 * Firebase Configuration & Initialization
 * Uses Firestore for real-time collaboration
 */
const firebaseConfig = {
    apiKey: "AIzaSyCyqEQaHkALJmDA0Wg1A8KPneEWGjNLXN4",
    authDomain: "myweatherpal-e83ae.firebaseapp.com",
    projectId: "myweatherpal-e83ae",
    storageBucket: "myweatherpal-e83ae.firebasestorage.app",
    messagingSenderId: "10859570958",
    appId: "1:10859570958:web:2faedcb39f18373efad95f"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Enable persistence for offline support
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
    console.warn('Firestore persistence not available:', err.code);
});
