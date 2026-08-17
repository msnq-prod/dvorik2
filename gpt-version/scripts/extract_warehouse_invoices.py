import json
import math
import re
from collections import defaultdict
from pathlib import Path

import pandas as pd

SOURCES = [
    (Path("/private/tmp/dvorik-warehouse-source/Счет на оплату № 20549 от 06.07.2026.xlsx"), "20549", "2026-07-06"),
    (Path("/private/tmp/dvorik-warehouse-source/Счет на оплату № 20953 от 10.07.2026.xlsx"), "20953", "2026-07-10"),
    (Path("/private/tmp/dvorik-warehouse-source/Счет на оплату № 22566 от 20.07.2026.xlsx"), "22566", "2026-07-20"),
]
OUTPUT = Path("data/warehouse-initial-seed.json")

# Фактическая ручная инвентаризация от 2026-07-27. Позиции, которых нет в
# списке, считаются отсутствующими. Короткие названия — рабочие названия на
# витрине и в Warehouse UI.
ACTUAL_STOCK = {
    "УТ-00004165": {"localName": "Зубные щётки", "packages": 1},
    "УТ-00004938": {"localName": "Синие дольки", "packages": 2},
    "УТ-00008630": {"localName": "Астероиды", "packages": 1},
    "УТ-00008331": {"localName": "Кольца астероиды", "packages": 2},
    "УТ-00007090": {"localName": "Бутылочки розовые", "packages": 1},
    "УТ-00007091": {"localName": "Бутылочки синие", "packages": 1},
    "УТ-00008645": {"localName": "Бутылочки кола-вишня", "packages": 1},
    "УТ-00008397": {"localName": "Кислая вишня", "packages": 1},
    "УТ-00008815": {"localName": "Кислый микс", "packages": 1},
    "УТ-00007654": {"localName": "Ягоды разноцветные", "packages": 2},
    "УТ-00008367": {"localName": "Шапочки клубника-сливки", "packages": 1},
    "УТ-00003763": {"localName": "Клубника с начинкой", "packages": 1},
    "УТ-00008003": {"localName": "Ананасы", "packages": 1},
    "УТ-00008304": {"localName": "Гигантские акулы", "packages": 4},
    "УТ-00005227": {"localName": "Черви кола", "packages": 1},
    "УТ-00006668": {"localName": "Гигантские бутылочки кола", "packages": 2},
    "УТ-00005241": {"localName": "Мыши", "packages": 3},
    "УТ-00004610": {"localName": "Запечённое мороженое", "packages": 2},
    "УТ-00008906": {"localName": "Кислые пауки", "packages": 3},
    "УТ-00001160": {"localName": "Пицца", "packages": 4},
    "УТ-00008392": {"localName": "Морковки Равацци", "packages": 4},
    "УТ-00002137": {"localName": "Маленькая яичница", "packages": 2},
    "УТ000000469": {"localName": "Большая яичница", "packages": 3},
    "УТ-00000246": {"localName": "Гигантские медведи", "packages": 1},
    "УТ000000446": {"localName": "Гигантские лягушки", "packages": 4},
    "УТ-00001158": {"localName": "Маленькие мишки", "packages": 1},
    "УТ-00008706": {"localName": "Прозрачные червяки", "packages": 1},
    "УТ-00002646": {"localName": "Гигантская клубника", "packages": 3},
    "УТ-00005836": {"localName": "Гигантский виноград", "packages": 2},
    "УТ-00005482": {"localName": "Клубника красная с начинкой", "packages": 1},
    "УТ-00009221": {"localName": "Кислые черепа", "packages": 1},
    "УТ-00008716": {"localName": "Кислая акула", "packages": 1},
}


def mass_grams(unit: str, name: str):
    unit_match = re.search(r"\((\d+(?:[.,]\d+)?)\s*кг\)", unit, re.I)
    if unit_match:
        return round(float(unit_match.group(1).replace(",", ".")) * 1000)
    description_match = re.search(r"(\d+(?:[.,]\d+)?)\s*гр\s*[хx]\s*(\d+)", name, re.I)
    if description_match:
        return round(float(description_match.group(1).replace(",", ".")) * int(description_match.group(2)))
    return None


invoices = []
all_lines = []
for source, number, date in SOURCES:
    frame = pd.read_excel(source, header=None)
    raw = []
    transport = 0
    for _, row in frame.iterrows():
        position = row.get(1)
        if not isinstance(position, (int, float)) or pd.isna(position):
            continue
        code = str(row.get(3) or "").strip()
        name = str(row.get(7) or "").strip()
        quantity = int(row.get(27) or 0)
        unit = str(row.get(29) or "").strip()
        unit_price = float(row.get(32) or 0)
        total = float(row.get(36) or 0)
        if "транспортные услуги" in name.lower():
            transport += total
            continue
        raw.append({
            "code": code,
            "name": name,
            "quantityPackages": quantity,
            "unit": unit,
            "packageMassGrams": mass_grams(unit, name),
            "inventoryKind": "piece" if unit.lower().startswith(("кор", "блок")) else "weight",
            "unitPriceRub": round(unit_price, 2),
            "lineTotalRub": round(total, 2),
        })
    combined = {}
    for item in raw:
        key = item["code"]
        if key not in combined:
            combined[key] = dict(item)
        else:
            combined[key]["quantityPackages"] += item["quantityPackages"]
            combined[key]["lineTotalRub"] = round(combined[key]["lineTotalRub"] + item["lineTotalRub"], 2)
    goods_total = round(sum(item["lineTotalRub"] for item in combined.values()), 2)
    allocated = 0
    rows = list(combined.values())
    for index, item in enumerate(rows):
        delivery = round(transport - allocated, 2) if index == len(rows) - 1 else round(transport * item["lineTotalRub"] / goods_total, 2)
        allocated += delivery
        item.update({
            "invoiceNumber": number,
            "deliveredAt": date,
            "allocatedDeliveryRub": delivery,
            "landedTotalRub": round(item["lineTotalRub"] + delivery, 2),
        })
        all_lines.append(item)
    invoices.append({
        "invoiceNumber": number,
        "deliveredAt": date,
        "goodsTotalRub": goods_total,
        "transportRub": round(transport, 2),
        "invoiceTotalRub": round(goods_total + transport, 2),
        "positions": len(rows),
        "packages": sum(item["quantityPackages"] for item in rows),
    })

by_product = defaultdict(list)
for line in all_lines:
    by_product[line["code"]].append(line)

products = []
lots = []
consumption = []
unverified_opening_lots = []
for code, product_lines in sorted(by_product.items()):
    product_lines.sort(key=lambda item: (item["deliveredAt"], item["invoiceNumber"]))
    delivered = sum(item["quantityPackages"] for item in product_lines)
    actual = ACTUAL_STOCK.get(code)
    estimated_remaining = actual["packages"] if actual else 0
    documented_remaining = min(delivered, estimated_remaining)
    unverified_opening = estimated_remaining - documented_remaining
    consume_left = delivered - documented_remaining
    recognized_cost = 0
    for line in product_lines:
        consumed = min(consume_left, line["quantityPackages"])
        remaining = line["quantityPackages"] - consumed
        consume_left -= consumed
        unit_landed = line["landedTotalRub"] / line["quantityPackages"]
        cost = round(consumed * unit_landed, 2)
        recognized_cost += cost
        lot_id = f"invoice-{line['invoiceNumber']}-{code}"
        lots.append({
            "lotId": lot_id,
            "invoiceNumber": line["invoiceNumber"],
            "productCode": code,
            "receivedPackages": line["quantityPackages"],
            "remainingPackages": remaining,
            "packageMassGrams": line["packageMassGrams"],
            "purchaseCostRub": line["lineTotalRub"],
            "allocatedDeliveryRub": line["allocatedDeliveryRub"],
            "landedCostRub": line["landedTotalRub"],
            "deliveredAt": line["deliveredAt"],
        })
        if consumed:
            consumption.append({
                "productCode": code,
                "lotId": lot_id,
                "estimatedConsumedPackages": consumed,
                "recognizedCostRub": cost,
                "basis": "estimated_fifo_to_current_cap",
            })
    if unverified_opening:
        unit_landed = latest["landedTotalRub"] / latest["quantityPackages"]
        opening_cost = round(unverified_opening * unit_landed, 2)
        opening_lot_id = f"opening-unverified-{code}"
        lots.append({
            "lotId": opening_lot_id,
            "invoiceNumber": "OPENING-UNVERIFIED",
            "productCode": code,
            "receivedPackages": unverified_opening,
            "remainingPackages": unverified_opening,
            "packageMassGrams": latest["packageMassGrams"],
            "purchaseCostRub": opening_cost,
            "allocatedDeliveryRub": 0.0,
            "landedCostRub": opening_cost,
            "deliveredAt": "2026-07-27",
        })
        unverified_opening_lots.append({"productCode": code, "packages": unverified_opening, "costRub": opening_cost})
    latest = product_lines[-1]
    remaining_mass = estimated_remaining * latest["packageMassGrams"] if latest["packageMassGrams"] else None
    products.append({
        "code": code,
        "name": latest["name"],
        "localName": actual["localName"] if actual else "",
        "unit": latest["unit"],
        "inventoryKind": latest["inventoryKind"],
        "packageMassGrams": latest["packageMassGrams"],
        "deliveredPackages": delivered,
        "estimatedConsumedPackages": delivered - estimated_remaining,
        "estimatedRemainingPackages": estimated_remaining,
        "estimatedRemainingMassGrams": remaining_mass,
        "remainingCap": None,
        "estimatedRecognizedCostRub": round(recognized_cost, 2),
        "unverifiedOpeningPackages": unverified_opening,
        "confidence": "operator_count" if actual else "zero_by_operator_count",
    })

if unverified_opening_lots:
    invoices.append({
        "invoiceNumber": "OPENING-UNVERIFIED",
        "deliveredAt": "2026-07-27",
        "goodsTotalRub": round(sum(item["costRub"] for item in unverified_opening_lots), 2),
        "transportRub": 0.0,
        "invoiceTotalRub": round(sum(item["costRub"] for item in unverified_opening_lots), 2),
        "positions": len(unverified_opening_lots),
        "packages": sum(item["packages"] for item in unverified_opening_lots),
    })

payload = {
    "schemaVersion": 1,
    "generatedAt": "2026-07-27T00:00:00+10:00",
    "asOfDate": "2026-07-27",
    "supplier": {"id": "gordeeva-ip", "name": "ИП Гордеева Людмила Владимировна", "inn": "504790274480"},
    "assumptions": [
        "Текущий остаток — фактический ручной пересчёт оператора на 2026-07-27; позиции вне списка считаются отсутствующими.",
        "Расход восстановлен как разница между поставками и фактическим пересчётом.",
        "Расход распределён по FIFO; точные даты продаж неизвестны.",
        "Транспорт распределён пропорционально стоимости товарных строк счета.",
        "Неоднозначные сопоставления: синие/розовые бутылочки — цветовые позиции сердец с начинкой; шапочки — бело-розовые сердечки; клубника с начинкой — клубника со сливками.",
        "Если фактический остаток превышает документированную поставку, превышение внесено отдельной партией OPENING-UNVERIFIED с себестоимостью последней документированной партии и требует подтверждения.",
    ],
    "invoices": invoices,
    "products": products,
    "lots": lots,
    "estimatedConsumption": consumption,
}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({
    "invoices": len(invoices),
    "products": len(products),
    "lots": len(lots),
    "deliveredPackages": sum(item["deliveredPackages"] for item in products),
    "estimatedRemainingPackages": sum(item["estimatedRemainingPackages"] for item in products),
    "estimatedConsumedPackages": sum(item["estimatedConsumedPackages"] for item in products),
    "invoiceTotalRub": round(sum(item["invoiceTotalRub"] for item in invoices), 2),
}, ensure_ascii=False))
