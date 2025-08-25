import { Actor, HttpAgent } from '@dfinity/agent';
import { AuthClient } from '@dfinity/auth-client';
import { Principal } from '@dfinity/principal';
import * as backend from './declarations/backend/index.js'; // После dfx generate

let actor = backend; // Default export from declarations
let authClient;
let identity;

// i18n
let currentLang = 'en';
const translations = {
  en: {
    login: 'Login with II',
    search: 'Search',
    createEvent: 'Create Event',
    buy: 'Buy Ticket',
    fiat: 'Pay with Card (Stub)',
    crypto: 'Pay with ICP',
    admin: 'Admin Panel',
    approve: 'Approve',
    reject: 'Reject',
    edit: 'Edit',
    loggedIn: 'Logged In',
  },
  uk: {
    login: 'Увійти з II',
    search: 'Пошук',
    createEvent: 'Створити Подію',
    buy: 'Купити Квиток',
    fiat: 'Оплатити Картою (Заглушка)',
    crypto: 'Оплатити ICP',
    admin: 'Панель Адміна',
    approve: 'Схвалити',
    reject: 'Відхилити',
    edit: 'Редагувати',
    loggedIn: 'Увійшли',
  }
};

function t(key) { return translations[currentLang][key] || key; }

function switchLang(lang) {
  currentLang = lang;
  updateUI();
}

async function initAuth() {
  authClient = await AuthClient.create();
  if (await authClient.isAuthenticated()) {
    handleAuthenticated();
  }
}

function handleAuthenticated() {
  identity = authClient.getIdentity();
  const host = window.location.hostname === 'localhost' ? 'http://localhost:4943' : 'https://ic0.app';
  const agent = new HttpAgent({ host, identity });
  if (host === 'http://localhost:4943') {
    agent.fetchRootKey(); // For local dev
  }
  actor = Actor.createActor(backend.idlFactory, {
    agent,
    canisterId: backend.canisterId,
  });
  document.getElementById('login-btn').innerText = t('loggedIn');
  checkAdmin();
}

async function login() {
  await authClient.login({
    onSuccess: handleAuthenticated,
    identityProvider: window.location.hostname === 'localhost' 
      ? 'http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/' 
      : 'https://identity.ic0.app/#authorize',
  });
}

async function checkAdmin() {
  try {
    const isAdmin = await actor.isAdmin();
    if (isAdmin) {
      document.getElementById('admin-panel').style.display = 'block';
      loadPending();
    }
  } catch (err) {
    console.error('Error checking admin:', err);
  }
}

async function searchEvents() {
  const city = document.getElementById('city-filter').value || null;
  const date = document.getElementById('date-filter').value || null;
  const cat = document.getElementById('category-filter').value || null;
  const events = await actor.getEvents(city ? city : null, date ? date : null, cat ? cat : null);
  const container = document.getElementById('events');
  container.innerHTML = '';
  events.forEach(e => {
    const card = document.createElement('div');
    card.className = 'event-card';
    card.innerHTML = `
      <img src="${e.image || 'placeholder.jpg'}" alt="${e.name}">
      <h3>${e.name}</h3>
      <p>Date: ${e.date}, City: ${e.city}, Category: ${e.category}</p>
      <p>Price: ${Number(e.priceICP) / 1e8} ICP</p>
      <button onclick="openBuyModal(${e.id})">${t('buy')}</button>
    `;
    container.appendChild(card);
  });
}

function openBuyModal(eventId) {
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = `
    <h3>Buy Ticket</h3>
    <button onclick="payFiat()">${t('fiat')}</button>
    <button onclick="payICP(${eventId})">${t('crypto')}</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

function closeModal() { document.getElementById('modal').style.display = 'none'; }

function payFiat() { alert('Fiat payment stub: Success!'); closeModal(); }

async function payICP(eventId) {
  try {
    const ticketId = await actor.buyTicket(eventId);
    alert(`NFT Ticket minted: ID ${ticketId}`);
  } catch (err) {
    alert('Error buying ticket: ' + err.message);
  }
  closeModal();
}

async function loadCategories() {
  const cats = await actor.getCategories();
  const select = document.getElementById('category-filter');
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.text = c;
    select.appendChild(opt);
  });
  // Static for test
  ['Kyiv', 'Warsaw'].forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.text = c;
    document.getElementById('city-filter').appendChild(opt);
  });
  ['2025-08-25', '2025-09-01'].forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.text = d;
    document.getElementById('date-filter').appendChild(opt);
  });
}

async function addEvent() {
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = `
    <h3>${t('createEvent')}</h3>
    <input id="name" placeholder="Name"><br>
    <input id="date" placeholder="Date (YYYY-MM-DD)"><br>
    <input id="city" placeholder="City"><br>
    <select id="cat">
      <option>Concerts</option>
      <option>Theaters</option>
      <option>Festivals</option>
      <option>Sports</option>
      <option>Seminars</option>
    </select><br>
    <input id="price" placeholder="Price in ICP (whole number)" type="number"><br>
    <input id="desc" placeholder="Description"><br>
    <input id="img" placeholder="Image URL"><br>
    <button onclick="submitEvent()">Submit</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function submitEvent() {
  const name = document.getElementById('name').value;
  const date = document.getElementById('date').value;
  const city = document.getElementById('city').value;
  const category = document.getElementById('cat').value;
  const priceICP = BigInt(document.getElementById('price').value * 1e8); // to e8s
  const description = document.getElementById('desc').value;
  const image = document.getElementById('img').value;
  try {
    const id = await actor.createEvent(name, date, city, category, priceICP, description, image);
    alert('Event submitted for verification: ID ' + id);
  } catch (err) {
    alert('Error creating event: ' + err.message);
  }
  closeModal();
}

async function loadPending() {
  const pendings = await actor.getPendingEvents();
  const container = document.getElementById('pending-events');
  container.innerHTML = '';
  pendings.forEach(e => {
    const card = document.createElement('div');
    card.innerHTML = `
      <h3>${e.name}</h3>
      <p>Organizer: ${Principal.toText(e.organizer)}</p>
      <button onclick="approve(${e.id}, true)">${t('approve')}</button>
      <button onclick="approve(${e.id}, false)">${t('reject')}</button>
      <button onclick="editEvent(${e.id})">${t('edit')}</button>
      <button onclick="contactOrganizer(${e.id})">Contact</button>
    `;
    container.appendChild(card);
  });
}

async function approve(id, approve) {
  try {
    await actor.approveEvent(id, approve, null);
    loadPending();
  } catch (err) {
    alert('Error approving: ' + err.message);
  }
}

function editEvent(id) {
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = `
    <h3>Edit Event (Name only for example)</h3>
    <input id="newName" placeholder="New Name"><br>
    <button onclick="submitEdit(${id})">Save and Approve</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function submitEdit(id) {
  const newName = document.getElementById('newName').value;
  try {
    await actor.approveEvent(id, true, newName ? newName : null);
    alert('Event edited and approved');
    loadPending();
  } catch (err) {
    alert('Error editing: ' + err.message);
  }
  closeModal();
}

async function contactOrganizer(id) {
  try {
    const org = await actor.getOrganizer(id);
    alert(`Contact organizer: Principal ${org ? Principal.toText(org) : 'Unknown'}`);
  } catch (err) {
    alert('Error getting organizer: ' + err.message);
  }
}

function updateUI() {
  document.getElementById('login-btn').innerText = t('login');
  // Update other buttons dynamically
  const buttons = document.querySelectorAll('button');
  buttons.forEach(b => {
    const key = Object.keys(translations.en).find(k => translations.en[k] === b.innerText || translations.uk[k] === b.innerText);
    if (key) b.innerText = t(key);
  });
  // Re-render if needed
}

document.getElementById('login-btn').onclick = login;
initAuth();
loadCategories();
searchEvents();
updateUI();