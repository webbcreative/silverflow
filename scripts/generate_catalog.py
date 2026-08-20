#!/usr/bin/env python3
"""Generate Silverflow's compact crafting catalog from ao-data/ao-bin-dumps.

The output keeps marketplace-visible craftable items and the fields needed by
the browser calculation engine. Recipe variants are preserved so the app can
pick the cheapest valid component path in each city.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

RAW_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json"
FORMATTED_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json"

SUBCAT_TO_CITY = {
    "sword": "Lymhurst", "bow": "Lymhurst", "arcanestaff": "Lymhurst",
    "axe": "Martlock", "quarterstaff": "Martlock", "froststaff": "Martlock",
    "mace": "Thetford", "firestaff": "Thetford", "naturestaff": "Thetford",
    "hammer": "Fort Sterling", "spear": "Fort Sterling", "holystaff": "Fort Sterling",
    "crossbow": "Bridgewatch", "dagger": "Bridgewatch", "cursestaff": "Bridgewatch",
    "knuckles": "Caerleon", "shapeshifterstaff": "Caerleon",
    "cloth_armor": "Fort Sterling", "plate_helmet": "Fort Sterling",
    "leather_helmet": "Lymhurst", "leather_shoes": "Lymhurst",
    "plate_armor": "Bridgewatch", "cloth_shoes": "Bridgewatch",
    "leather_armor": "Thetford", "cloth_helmet": "Thetford",
    "plate_shoes": "Martlock",
}
CATEGORY_TO_CITY = {
    "offhands": "Martlock", "bags": "Brecilien", "capes": "Brecilien",
    "gathering": "Caerleon", "tools": "Caerleon",
    "potions": "Brecilien", "food": "Caerleon",
}


def download_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "silverflow-catalog-generator/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        return json.load(response)


def localized_name_map(formatted) -> dict[str, str]:
    rows = formatted if isinstance(formatted, list) else formatted.get("items", formatted.get("Items", []))
    out = {}
    if isinstance(rows, dict):
        rows = list(rows.values())
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        uid = row.get("UniqueName") or row.get("@uniquename")
        names = row.get("LocalizedNames") or {}
        if uid and isinstance(names, dict):
            out[uid] = names.get("EN-US") or names.get("EN") or next((v for v in names.values() if v), uid)
    return out


def walk_dicts(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_dicts(child)


def price_id(resource: dict) -> str | None:
    uid = resource.get("@uniquename")
    if not uid:
        return None
    level = resource.get("@enchantmentlevel")
    if level and str(level) != "0" and "@" not in uid:
        return f"{uid}@{level}"
    return uid


def materials(craftreq: dict) -> list[dict]:
    resources = craftreq.get("craftresource")
    if not resources:
        return []
    if isinstance(resources, dict):
        resources = [resources]
    result = []
    for resource in resources:
        if not isinstance(resource, dict):
            continue
        uid = price_id(resource)
        if not uid:
            continue
        count = float(resource.get("@count", 0) or 0)
        if count <= 0:
            continue
        result.append({
            "id": uid,
            "count": int(count) if count.is_integer() else count,
            "returnable": str(resource.get("@maxreturnamount", "1")) != "0",
        })
    return result


def recipe_variants(craftreq) -> list[dict]:
    reqs = craftreq if isinstance(craftreq, list) else [craftreq]
    variants = []
    for req in reqs:
        if not isinstance(req, dict):
            continue
        mats = materials(req)
        if not mats:
            continue
        amount = float(req.get("@amountcrafted", 1) or 1)
        silver = float(req.get("@silver", 0) or 0)
        variants.append({
            "amountCrafted": int(amount) if amount.is_integer() else amount,
            "silver": int(silver) if silver.is_integer() else silver,
            "materials": mats,
        })
    return variants


def tier_of(uid: str, item: dict) -> int:
    value = item.get("@tier")
    if value:
        try:
            return int(value)
        except ValueError:
            pass
    match = re.match(r"T(\d+)_", uid)
    return int(match.group(1)) if match else 0


def category_of(uid: str, item: dict) -> str:
    if "_HEAD_" in uid: return "head"
    if "_ARMOR_" in uid: return "armor"
    if "_SHOES_" in uid: return "shoes"
    if "_MAIN_" in uid or "_2H_" in uid: return "weapon"
    if "_OFF_" in uid: return "offhand"
    if "_BAG" in uid: return "bag"
    if "_CAPE" in uid: return "cape"
    raw = item.get("@shopcategory") or item.get("@category") or "other"
    return str(raw).lower().replace(" ", "_")


def bonus_city(item: dict) -> str | None:
    cat = str(item.get("@shopcategory", "")).lower()
    sub = str(item.get("@shopsubcategory1", "")).lower()
    if cat in CATEGORY_TO_CITY:
        return CATEGORY_TO_CITY[cat]
    if sub in SUBCAT_TO_CITY:
        return SUBCAT_TO_CITY[sub]
    joined = f"{cat} {sub}"
    if "potion" in joined: return "Brecilien"
    if "food" in joined or "meal" in joined: return "Caerleon"
    if "tool" in joined or "gather" in joined: return "Caerleon"
    return None


def build_catalog(raw, names) -> list[dict]:
    root = raw.get("items", raw)
    output = {}
    for item in walk_dicts(root):
        uid = item.get("@uniquename")
        base_req = item.get("craftingrequirements")
        if not uid or not base_req:
            continue
        if str(item.get("@showinmarketplace", "true")).lower() == "false":
            continue
        tier = tier_of(uid, item)
        if tier < 2 or tier > 8:
            continue
        base_variants = recipe_variants(base_req)
        if base_variants:
            output[uid] = {
                "id": uid, "name": names.get(uid, uid), "tier": tier,
                "enchantment": 0, "category": category_of(uid, item),
                "subcategory": str(item.get("@shopsubcategory1", "")).lower(),
                "bonusCity": bonus_city(item), "variants": base_variants,
            }
        ench = item.get("enchantments")
        if not ench:
            continue
        levels = ench.get("enchantment", []) if isinstance(ench, dict) else ench
        if isinstance(levels, dict):
            levels = [levels]
        for level in levels or []:
            if not isinstance(level, dict):
                continue
            enchant = int(level.get("@enchantmentlevel", 0) or 0)
            if enchant <= 0:
                continue
            variants = recipe_variants(level.get("craftingrequirements"))
            if not variants:
                continue
            eid = f"{uid}@{enchant}"
            output[eid] = {
                "id": eid, "name": names.get(eid, names.get(uid, uid)), "tier": tier,
                "enchantment": enchant, "category": category_of(uid, item),
                "subcategory": str(item.get("@shopsubcategory1", "")).lower(),
                "bonusCity": bonus_city(item), "variants": variants,
            }
    return sorted(output.values(), key=lambda x: (x["tier"], x["category"], x["name"], x["enchantment"]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="data/catalog.json")
    parser.add_argument("--raw", help="Use a local raw items.json instead of downloading")
    parser.add_argument("--formatted", help="Use a local formatted/items.json instead of downloading")
    args = parser.parse_args()
    print("Loading ao-bin-dumps raw item data…", file=sys.stderr)
    raw = json.load(open(args.raw, encoding="utf-8")) if args.raw else download_json(RAW_URL)
    print("Loading localized item metadata…", file=sys.stderr)
    formatted = json.load(open(args.formatted, encoding="utf-8")) if args.formatted else download_json(FORMATTED_URL)
    names = localized_name_map(formatted)
    catalog = build_catalog(raw, names)
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(catalog, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(catalog):,} craftable market recipes to {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
