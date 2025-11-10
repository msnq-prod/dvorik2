export function renderCampaignsMenu(element: HTMLDivElement) {
  element.innerHTML = `
    <h2>Campaigns Menu</h2>
    <div>
      <input id="campaign-name-input" type="text" placeholder="Campaign Name">
      <button id="create-campaign-btn">Create Campaign</button>
    </div>
    <div id="campaigns-list">
      <!-- Campaign tiles will be rendered here -->
    </div>
  `;

  document.getElementById('create-campaign-btn')!.addEventListener('click', createCampaign);
}

async function createCampaign() {
  const campaignNameInput = document.getElementById('campaign-name-input') as HTMLInputElement;
  const campaignName = campaignNameInput.value;

  if (!campaignName) {
    alert('Please enter a campaign name.');
    return;
  }

  const response = await fetch('/api/campaigns/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: campaignName }),
  });

  if (response.ok) {
    alert('Campaign created successfully!');
    campaignNameInput.value = '';
    // Optionally, refresh the list of campaigns
  } else {
    alert('Failed to create campaign.');
    console.error(await response.text());
  }
}
