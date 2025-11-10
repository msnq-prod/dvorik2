export function renderMainMenu(element: HTMLDivElement) {
  element.innerHTML = `
    <h2>Main Menu</h2>
    <div>
      <textarea placeholder="Enter message to send to users"></textarea>
      <div>
        <h4>Filters:</h4>
        <label>Age:</label>
        <input type="text" placeholder="e.g., 18-30">
        <label>Gender:</label>
        <select>
          <option>Any</option>
          <option>Male</option>
          <option>Female</option>
        </select>
        <label>Status:</label>
        <input type="text" placeholder="e.g., VIP">
      </div>
      <button>Send Message</button>
    </div>
    <div>
      <input type="text" placeholder="Enter coupon code to check">
      <button>Check Coupon</button>
    </div>
  `;
}
