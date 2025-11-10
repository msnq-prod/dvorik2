import './style.css'
import { renderMainMenu } from './components/MainMenu';
import { renderCouponGeneratorMenu } from './components/CouponGeneratorMenu';
import { renderCampaignsMenu } from './components/CampaignsMenu';
import { renderDatabaseEditor } from './components/DatabaseEditor';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <h1>Admin Panel</h1>
  <nav>
    <button id="main-menu-btn">Main Menu</button>
    <button id="coupon-generator-btn">Coupon Generator</button>
    <button id="campaigns-btn">Campaigns</button>
    <button id="db-editor-btn">DB Editor</button>
  </nav>
  <div id="content"></div>
`;

const content = document.querySelector<HTMLDivElement>('#content')!;

document.getElementById('main-menu-btn')!.addEventListener('click', () => {
  renderMainMenu(content);
});

document.getElementById('coupon-generator-btn')!.addEventListener('click', () => {
  renderCouponGeneratorMenu(content);
});

document.getElementById('campaigns-btn')!.addEventListener('click', () => {
  renderCampaignsMenu(content);
});

document.getElementById('db-editor-btn')!.addEventListener('click', () => {
  renderDatabaseEditor(content);
});

// Render the main menu by default
renderMainMenu(content);
