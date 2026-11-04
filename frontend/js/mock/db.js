// Mock data store, kept in localStorage.
// The data is split by OWNING SERVICE on purpose: each top-level key below maps to
// one PostgreSQL schema in the real system (proposal section 5, "one schema per service").
// When a real service replaces its mock, its key here is what moves into Postgres.

const KEY = 'pap.mockdb.v1';

const now = Date.now();
const daysAgo = (d) => new Date(now - d * 86400000).toISOString();

function seed() {
  const shelters = [
    { id: 'sh-thimphu', name: 'Thimphu Animal Rescue', district: 'Thimphu', address: 'Changjiji, Thimphu', phone: '+975 2 333 101', email: 'hello@thimphurescue.bt', about: 'The capital\'s largest shelter. We rehome street dogs and cats from across Thimphu valley and run free sterilisation days every month.', status: 'approved', createdAt: daysAgo(400) },
    { id: 'sh-paro', name: 'Paro Valley Pet Haven', district: 'Paro', address: 'Bondey, Paro', phone: '+975 8 271 202', email: 'care@parohaven.bt', about: 'A small family-run haven near the airport road. Rabbits, cats and the occasional rescued bird alongside our dogs.', status: 'approved', createdAt: daysAgo(300) },
    { id: 'sh-pling', name: 'Phuentsholing Paws', district: 'Chukha', address: 'Toorsa, Phuentsholing', phone: '+975 5 252 303', email: 'adopt@pspaws.bt', about: 'Border-town shelter caring for animals rescued from the highway and the town market.', status: 'approved', createdAt: daysAgo(220) },
    { id: 'sh-bumthang', name: 'Bumthang Friends of Animals', district: 'Bumthang', address: 'Chamkhar, Bumthang', phone: '+975 3 631 404', email: 'friends@bumthangpets.bt', about: 'New volunteer group, waiting for admin approval.', status: 'pending', createdAt: daysAgo(2) },
  ];

  const P = (id, name, species, breed, sex, ageMonths, size, coat, shelterId, description, extra = {}) => ({
    id, name, species, breed, sex, ageMonths, size, coat, shelterId, description,
    vaccinated: true, neutered: ageMonths > 8, goodWith: ['adults'], imageUrl: '', createdAt: daysAgo(Math.floor(Math.random() * 60) + 1),
    ...extra,
  });

  const pets = [
    P('pet-tashi', 'Tashi', 'dog', 'Bhutanese mix', 'male', 26, 'medium', '#b07a45', 'sh-thimphu', 'Tashi was found sleeping outside Centenary Farmers\' Market. He is calm, walks well on a lead and loves a belly rub.', { goodWith: ['adults', 'children', 'dogs'] }),
    P('pet-pema', 'Pema', 'cat', 'Domestic short hair', 'female', 14, 'small', '#d9d2c5', 'sh-thimphu', 'Pema is a quiet cat who likes sunny windows and soft blankets. Fine alone during the work day.', { goodWith: ['adults'] }),
    P('pet-kinley', 'Kinley', 'dog', 'Himalayan sheepdog mix', 'female', 48, 'large', '#3a3330', 'sh-thimphu', 'A gentle giant. Kinley needs a home with space and a daily walk, and she is very patient with children.', { goodWith: ['adults', 'children'] }),
    P('pet-dorji', 'Dorji', 'dog', 'Bhutanese mix', 'male', 5, 'small', '#e1b57a', 'sh-thimphu', 'A playful puppy, still learning manners. First vaccinations done; second dose due next month.', { neutered: false, goodWith: ['adults', 'children', 'dogs', 'cats'] }),
    P('pet-sonam', 'Sonam', 'cat', 'Tabby', 'male', 36, 'medium', '#9c7b55', 'sh-paro', 'Sonam is confident and chatty. He gets along with calm dogs and will follow you from room to room.', { goodWith: ['adults', 'dogs'] }),
    P('pet-karma', 'Karma', 'rabbit', 'Lionhead', 'female', 10, 'small', '#f1ede6', 'sh-paro', 'Karma is litter trained and enjoys fresh coriander. Best with gentle older children.', { goodWith: ['adults', 'children'] }),
    P('pet-yangchen', 'Yangchen', 'bird', 'Budgerigar', 'female', 18, 'small', '#7fbf6a', 'sh-paro', 'A cheerful budgie who whistles in the morning. Comes with her cage.', { neutered: false }),
    P('pet-norbu', 'Norbu', 'dog', 'Tibetan mastiff mix', 'male', 90, 'large', '#5a3b26', 'sh-paro', 'Norbu is a senior who has slowed down. He wants a quiet yard and someone to sit with in the evening.', { goodWith: ['adults'] }),
    P('pet-chimi', 'Chimi', 'cat', 'Calico', 'female', 7, 'small', '#c98b4c', 'sh-pling', 'Chimi was rescued from the market with her siblings. Curious, brave and ready for a family.', { goodWith: ['adults', 'children', 'cats'] }),
    P('pet-jigme', 'Jigme', 'dog', 'Bhutanese mix', 'male', 30, 'medium', '#e9e2d4', 'sh-pling', 'Jigme loves the river walks along the Amochhu. Friendly with every person he meets.', { goodWith: ['adults', 'children', 'dogs'] }),
    P('pet-tshering', 'Tshering', 'rabbit', 'Dutch', 'male', 20, 'small', '#4b4441', 'sh-pling', 'Tshering is shy at first but loves being stroked once he trusts you.'),
    P('pet-ugyen', 'Ugyen', 'bird', 'Cockatiel', 'male', 40, 'small', '#d8cfa8', 'sh-pling', 'Ugyen can whistle the first few notes of the national anthem. Needs time out of the cage each day.', { neutered: false }),
    P('pet-lhamo', 'Lhamo', 'dog', 'Spitz mix', 'female', 66, 'small', '#f4f1ea', 'sh-thimphu', 'Lhamo is a small, fluffy companion. Ideal for apartment living.', { goodWith: ['adults', 'cats'] }),
    P('pet-rinzin', 'Rinzin', 'cat', 'Black short hair', 'male', 100, 'medium', '#2b2a2a', 'sh-thimphu', 'A senior gentleman with a loud purr. Rinzin is looking for a peaceful retirement home.'),
  ];

  // Accounts. Passwords are plain text ONLY because this is a browser mock.
  // login-service will store bcrypt hashes.
  const users = [
    { id: 'u-adopter', email: 'adopter@demo.bt', password: 'password123', role: 'adopter', shelterId: null, createdAt: daysAgo(30) },
    { id: 'u-staff', email: 'staff@thimphurescue.bt', password: 'password123', role: 'staff', shelterId: 'sh-thimphu', createdAt: daysAgo(200) },
    { id: 'u-staff2', email: 'staff@parohaven.bt', password: 'password123', role: 'staff', shelterId: 'sh-paro', createdAt: daysAgo(180) },
    { id: 'u-admin', email: 'admin@demo.bt', password: 'password123', role: 'admin', shelterId: null, createdAt: daysAgo(500) },
  ];

  const profiles = {
    'u-adopter': { userId: 'u-adopter', name: 'Karma Wangmo', phone: '+975 17 111 222', district: 'Thimphu', homeType: 'house', hasYard: true, otherPets: 'None', about: '' },
    'u-staff': { userId: 'u-staff', name: 'Sangay Dorji', phone: '+975 17 333 444', district: 'Thimphu', homeType: '', hasYard: false, otherPets: '', about: 'Adoption coordinator' },
    'u-staff2': { userId: 'u-staff2', name: 'Deki Choden', phone: '+975 17 555 666', district: 'Paro', homeType: '', hasYard: false, otherPets: '', about: 'Volunteer lead' },
    'u-admin': { userId: 'u-admin', name: 'Tenzin Norbu', phone: '', district: '', homeType: '', hasYard: false, otherPets: '', about: '' },
  };

  // adoption-service owns availability: one row per pet.
  const availability = {};
  for (const p of pets) availability[p.id] = { petId: p.id, status: 'available', applicationId: null };

  // One finished adoption and one waiting application, so every screen has data.
  availability['pet-norbu'] = { petId: 'pet-norbu', status: 'adopted', applicationId: 'app-1' };
  availability['pet-pema'] = { petId: 'pet-pema', status: 'pending', applicationId: 'app-2' };
  const applications = [
    { id: 'app-1', petId: 'pet-norbu', shelterId: 'sh-paro', userId: 'u-adopter', status: 'approved', message: 'We have a quiet house and a large garden in Babesa.', homeType: 'house', hasYard: true, otherPets: 'None', experience: 'Grew up with dogs', createdAt: daysAgo(20), decidedAt: daysAgo(17), decisionNote: 'Lovely home visit. Welcome to the family!' },
    { id: 'app-2', petId: 'pet-pema', shelterId: 'sh-thimphu', userId: 'u-adopter', status: 'submitted', message: 'Pema would have a sunny room to herself.', homeType: 'apartment', hasYard: false, otherPets: 'None', experience: 'First cat', createdAt: daysAgo(1), decidedAt: null, decisionNote: '' },
  ];

  const reviews = [
    { id: 'rv-1', shelterId: 'sh-thimphu', userId: 'u-adopter', authorName: 'Karma W.', rating: 5, comment: 'Staff answered every question and followed up after a week.', createdAt: daysAgo(40) },
    { id: 'rv-2', shelterId: 'sh-paro', userId: 'u-adopter', authorName: 'Karma W.', rating: 4, comment: 'Norbu came home healthy and vaccinated. The paperwork took a little while.', createdAt: daysAgo(15) },
    { id: 'rv-3', shelterId: 'sh-pling', userId: 'u-x', authorName: 'Tenzin P.', rating: 5, comment: 'Very caring volunteers.', createdAt: daysAgo(60) },
  ];

  return {
    _version: 1,
    signup: { users },               // signup-service writes, login-service reads (credentials)
    profile: { profiles },           // profile-service
    pet: { pets },                   // pet-service
    shelter: { shelters },           // shelter-service
    favorites: { byUser: { 'u-adopter': ['pet-kinley', 'pet-karma'] } }, // favorites-service
    adoption: { availability, applications }, // adoption-service (hot path)
    review: { reviews },             // review-service
    history: { entries: [{ id: 'h-1', userId: 'u-adopter', applicationId: 'app-1', petId: 'pet-norbu', petName: 'Norbu', shelterId: 'sh-paro', outcome: 'approved', at: daysAgo(17) }] }, // history-service
    notification: { items: [
      { id: 'n-1', userId: 'u-adopter', title: 'Your application for Norbu was approved', body: 'Lovely home visit. Welcome to the family!', link: '#/applications', read: true, createdAt: daysAgo(17) },
    ] },                             // notification-service
    email: { outbox: [] },           // email-worker (stand-in for Mailpit)
    reporting: { decided: { approved: 1, rejected: 0 } }, // reporting-service counters
    processed: {},                   // idempotency: event ids each consumer already handled
  };
}

let cache = null;

export function db() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : seed();
  } catch {
    cache = seed();
  }
  return cache;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage full or blocked: keep in memory */ }
}

export function resetDb() {
  cache = seed();
  save();
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
