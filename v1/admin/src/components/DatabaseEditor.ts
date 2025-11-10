export function renderDatabaseEditor(element: HTMLDivElement) {
  element.innerHTML = `
    <h2>Database Editor</h2>
    <div class="db-editor-container">
      <div class="db-tables">
        <h3>Tables</h3>
        <ul id="tables-list"></ul>
      </div>
      <div class="db-table-data">
        <h3 id="table-name"></h3>
        <div id="table-data-container"></div>
      </div>
    </div>
  `;

  fetchDatabaseSchema();
}

async function fetchDatabaseSchema() {
  const response = await fetch('/api/database/schema');
  if (!response.ok) {
    console.error("Failed to fetch database schema");
    return;
  }
  const schema = await response.json();
  const tablesList = document.getElementById('tables-list')!;
  tablesList.innerHTML = ''; // Clear previous list

  for (const tableName in schema) {
    const li = document.createElement('li');
    li.textContent = tableName;
    li.addEventListener('click', () => fetchTableData(tableName, schema[tableName]));
    tablesList.appendChild(li);
  }
}

async function fetchTableData(tableName: string, columns: any[]) {
  const response = await fetch(`/api/database/${tableName}`);
   if (!response.ok) {
    console.error(`Failed to fetch data for table ${tableName}`);
    return;
  }
  const data = await response.json();

  document.getElementById('table-name')!.textContent = tableName;
  const container = document.getElementById('table-data-container')!;
  container.innerHTML = '';

  if (data.length === 0) {
    container.innerHTML = '<p>No data in this table.</p>';
    return;
  }

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // Header
  const headerRow = document.createElement('tr');
  const columnNames = columns.map(c => c.name);
  columnNames.forEach(name => {
    const th = document.createElement('th');
    th.textContent = name;
    headerRow.appendChild(th);
  });
  const actionsTh = document.createElement('th');
  actionsTh.textContent = "Actions";
  headerRow.appendChild(actionsTh);
  thead.appendChild(headerRow);

  // Body
  data.forEach((row: any) => {
    const tr = document.createElement('tr');
    tr.dataset.rowId = row.id; // Store row id

    columnNames.forEach(colName => {
        const td = document.createElement('td');
        td.textContent = row[colName];
        if (colName !== 'id') { // Don't allow editing the ID
             td.setAttribute('contenteditable', 'true');
        }
        td.dataset.column = colName;
        tr.appendChild(td);
    });

    const actionsTd = document.createElement('td');
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.onclick = () => saveRowData(tableName, row.id);
    actionsTd.appendChild(saveButton);
    tr.appendChild(actionsTd);

    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

async function saveRowData(tableName: string, rowId: number) {
  const rowElement = document.querySelector(`tr[data-row-id='${rowId}']`)!;
  const cells = rowElement.querySelectorAll('td[data-column]');
  const data: { [key: string]: any } = {};

  cells.forEach((cell: any) => {
    const column = cell.dataset.column;
    if (column !== 'id') { // Do not include id in the update payload
      data[column] = cell.textContent;
    }
  });

  const response = await fetch(`/api/database/${tableName}/${rowId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (response.ok) {
    alert('Row updated successfully!');
  } else {
    alert('Failed to update row.');
    console.error(await response.text());
  }
}
