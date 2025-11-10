export function renderCouponGeneratorMenu(element: HTMLDivElement) {
  element.innerHTML = `
    <h2>Coupon Generator</h2>
    <div>
      <label>Expiration (in days):</label>
      <input type="number" value="30">
    </div>
    <div>
      <label>Discount Type:</label>
      <select>
        <option>Percentage</option>
        <option>Fixed Amount</option>
        <option>Comment</option>
      </select>
    </div>
    <div>
      <label>Discount Value:</label>
      <input type="text">
    </div>
    <div>
      <h4>Recipient Filters:</h4>
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
    <button>Generate Coupons</button>
  `;
}
