import { expect, test, type Page } from "@playwright/test";

type UserId = "u-seller" | "u-admin" | "u-super";

async function login(page: Page, userId: UserId, view = "dashboard", heading?: string) {
  await page.context().clearCookies();
  const query = new URLSearchParams({ tgUserId: userId });
  if (view !== "dashboard") query.set("view", view);
  await page.goto(`/?${query}`);
  const title = page.locator(".topbar h1");
  await expect(title).toHaveText(heading || (userId === "u-seller" ? "Меню" : "Главная"));
  await expect(page.locator(".skeleton")).toHaveCount(0);
}

async function expectCleanLayout(page: Page) {
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test("роли получают только доступную навигацию и URL синхронизирован", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });

  await login(page, "u-seller");
  await expect(page.getByRole("button", { name: /Найти товар/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Начать проверку/ })).toBeVisible();
  await expect(page.getByText("Пользователи", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Найти товар/ }).click();
  await expect(page).toHaveURL(/view=products/);
  await expect(page.locator(".topbar h1")).toHaveText("Товары");
  const back = page.getByRole("button", { name: "Назад" });
  if (await back.isVisible()) await back.click();
  else await page.goBack();
  await expect(page.locator(".topbar h1")).toHaveText("Меню");
  await page.goto("/?view=users");
  await expect(page.locator(".topbar h1")).toHaveText("Меню");
  await expect(page.getByRole("status")).toContainText("недоступен");
  await expectCleanLayout(page);

  await login(page, "u-admin");
  await expect(page.locator(".topbar h1")).toHaveText("Главная");
  await login(page, "u-admin", "saby", "Saby");
  await expect(page.getByText("Номенклатура Saby", { exact: true })).toBeVisible();
  await expectCleanLayout(page);

  await login(page, "u-super", "users", "Пользователи");
  await expect(page.getByRole("heading", { name: "Сотрудники", exact: true })).toBeVisible();
  await expectCleanLayout(page);
  expect(runtimeErrors).toEqual([]);
});

test("10 production-разделов загружаются без дублей и переполнения", async ({ page }) => {
  const sections: Array<[UserId, string, string]> = [
    ["u-seller", "dashboard", "Меню"],
    ["u-seller", "products", "Товары"],
    ["u-seller", "stock", "Склад"],
    ["u-seller", "inventory", "Проверка"],
    ["u-seller", "labels", "Маркировки"],
    ["u-seller", "schedule", "График"],
    ["u-admin", "reports", "Отчёты"],
    ["u-super", "users", "Пользователи"],
    ["u-admin", "saby", "Saby"],
    ["u-super", "audit", "Аудит"]
  ];
  for (const [userId, view, heading] of sections) {
    await login(page, userId, view, heading);
    await expectCleanLayout(page);
  }
});

test("поиск, первый экран и складская нижняя панель работают", async ({ page }, testInfo) => {
  await login(page, "u-admin", "products", "Товары");
  const search = page.getByPlaceholder("Поиск по названию, артикулу, штрихкоду");
  await search.fill("Ассорти");
  await expect(page.getByRole("button", { name: /Ассорти/ })).toBeVisible();
  if (testInfo.project.name.startsWith("mobile")) {
    const catalog = await page.getByRole("heading", { name: "Каталог", exact: true }).boundingBox();
    const metrics = await page.locator(".secondary-metrics").boundingBox();
    expect(catalog?.y).toBeLessThan(metrics?.y || Infinity);
  }

  await login(page, "u-seller", "inventory", "Проверка");
  const inventoryAction = page.getByRole("button", { name: "Начать общий пересчёт" });
  await expect(inventoryAction).toBeEnabled();
  if (testInfo.project.name.startsWith("mobile")) {
    expect((await inventoryAction.boundingBox())?.y).toBeLessThan(844 - 90);
  }

  await login(page, "u-seller", "labels", "Маркировки");
  await page.locator('.label-product-card input[type="checkbox"]').first().check();
  await expect(page.getByRole("button", { name: "Предпросмотр" })).toBeEnabled();

  await login(page, "u-seller", "stock", "Склад");
  await page.locator(".seller-location-card").first().click();
  await page.locator(".bot-stock-row").first().click();
  const dialog = page.getByRole("dialog", { name: /Действия с товаром/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Переместить" })).toBeVisible();
  if (testInfo.project.name.startsWith("mobile")) {
    const dialogBox = await dialog.boundingBox();
    const navBox = await page.getByRole("navigation", { name: "Основная навигация" }).boundingBox();
    expect(dialogBox?.y).toBeLessThan(navBox?.y || Infinity);
    expect((dialogBox?.y || 0) + (dialogBox?.height || 0)).toBeLessThanOrEqual((navBox?.y || 844) + 1);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expectCleanLayout(page);
});

test("ошибка API доступна, опасный диалог управляется с клавиатуры", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/?tgUserId=u-admin");
  await expect(page.locator(".topbar h1")).toHaveText("Главная");
  await page.route("**/api/reports/low", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ code: "REPORT_UNAVAILABLE", message: "Отчёт временно недоступен" })
  }));
  await page.goto("/?view=reports");
  await expect(page.getByRole("alert")).toContainText("Отчёт временно недоступен");

  await login(page, "u-super", "users", "Пользователи");
  const activeUserRow = page.locator("tbody tr").filter({ hasText: "Активен" }).first();
  await activeUserRow.locator("details.action-menu summary").click();
  const dangerous = page.getByRole("button", { name: "Заблокировать", exact: true }).first();
  await dangerous.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Отмена" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(dangerous).toBeFocused();
});
