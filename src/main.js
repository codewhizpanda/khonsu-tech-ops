import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from './router/index.js';
import App from './App.vue';
import '../css/styles.css';

// Every route is lazy-loaded (see router/index.js) and each deploy replaces
// dist/ wholesale, so old content-hashed chunk files stop existing on the
// server the moment a newer build ships. A tab left open across a deploy
// throws "Failed to fetch dynamically imported module" the next time it
// navigates to a route it hasn't loaded yet — reload once to pick up the
// current build instead of leaving the user stuck.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
