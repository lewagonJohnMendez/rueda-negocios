// assets/js/theme-toggle.js

const darkTheme = document.getElementById('dark-theme');
const toggleBtn = document.getElementById('theme-toggle');
const THEME_KEY = 'elind-theme';

// Función para aplicar el tema
function applyTheme(theme) {
  const isDark = theme === 'dark';

  // Activar/desactivar dark.css
  darkTheme.disabled = !isDark;

  // Configurar Bootstrap
  document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');

  // Texto e ícono del botón
  toggleBtn.textContent = isDark ? '🌙 Modo Oscuro' : '🌞 Modo Claro';

  // Guardar preferencia
  localStorage.setItem(THEME_KEY, theme);
}

// Inicializar según preferencia guardada
const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
applyTheme(savedTheme);

// Alternar entre temas al hacer clic
toggleBtn.addEventListener('click', () => {
  const nextTheme = darkTheme.disabled ? 'dark' : 'light';
  applyTheme(nextTheme);
});
