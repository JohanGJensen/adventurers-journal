import { useState } from 'react';
import type { Character } from '../../lib/character';
import { COINS, type Coin as CoinKey, type InventoryApi, type Item } from '../../hooks/useInventory';
import { useEquipmentInfo } from '../../hooks/useSpellInfo';
import type { EquipmentInfo } from '../../lib/api';
import { armorClassFrom, fmt } from '../../lib/rules';
import { ToolKit } from '../ToolKit';
import { Parchment } from '../kit';

const COIN_NAME: Record<CoinKey, string> = { cp: 'Copper', sp: 'Silver', ep: 'Electrum', gp: 'Gold', pp: 'Platinum' };
const IN_GP: Record<CoinKey, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };
/** Things you use up one at a time, which get a quick Use button. */
const CONSUMABLE = /potion|ration|berr|elixir|oil|scroll|antitoxin|torch|arrow|bolt|dart|candle/i;

/** "1d6 bludgeoning · Versatile (1d8)", "AC 11 + DEX", "+2 AC" */
const statLine = (s: EquipmentInfo) =>
  [s.ac, s.damage, s.versatile && `Versatile (${s.versatile})`, s.properties.join(', ')].filter(Boolean).join(' · ');

/** The Inventory tab: what's equipped (and where AC comes from), the backpack, coins, and tools. */
export function InventoryTab({ c, inventory, onOpen }: { c: Character; inventory: InventoryApi; onOpen: (name: string) => void }) {
  const { inv } = inventory;
  const [newName, setNewName] = useState('');
  const active = inv.items.filter((i) => i.equipped);
  const pack = inv.items.filter((i) => !i.equipped);
  const stats = useEquipmentInfo([...new Set(inv.items.map((i) => i.name))]);
  const armor = armorClassFrom(inv.items, c.mods.DEX, c.armorClass);
  const ac = c.acBonus ? { value: armor.value + c.acBonus, source: `${armor.source} ${fmt(c.acBonus)} (${c.subclass?.name})` } : armor;
  const wealth = COINS.reduce((n, k) => n + inv.coins[k] * IN_GP[k], 0);

  const add = () => {
    inventory.addItem(newName);
    setNewName('');
  };

  return (
    <div className="k-gear">
      <div className="k-gear-main">
        <Parchment as="section" gilt corners="top" className="k-card" aria-labelledby="k-equipped-h">
          <h2 id="k-equipped-h" className="k-h2">Equipped</h2>
          <p className="k-ac-line">
            <span className="k-ac-mini" aria-hidden="true">{ac.value}</span>
            <span>Armour class <strong>{ac.value}</strong>, from {ac.source}.</span>
          </p>
          <ul className="k-items">
            {active.map((item) => (
              <ItemRow key={item.id} item={item} stats={stats.get(item.name)} inventory={inventory} onOpen={onOpen} />
            ))}
            {active.length === 0 && <li className="k-hint">Nothing equipped. Equip armour, a shield or a weapon from the backpack.</li>}
          </ul>
        </Parchment>

        <Parchment as="section" gilt className="k-card" aria-labelledby="k-pack-h">
          <h2 id="k-pack-h" className="k-h2">Backpack <span className="k-h2-hint">{pack.reduce((n, i) => n + i.qty, 0)} things</span></h2>
          <ul className="k-items">
            {pack.map((item) => (
              <ItemRow key={item.id} item={item} stats={stats.get(item.name)} inventory={inventory} onOpen={onOpen} />
            ))}
            {pack.length === 0 && <li className="k-hint">The pack is empty.</li>}
          </ul>
          <form
            className="k-add-item"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <label className="k-sr" htmlFor="k-new-item">New item name</label>
            <input id="k-new-item" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add an item…" />
            <button className="btn small" type="submit" disabled={!newName.trim()}>Add</button>
          </form>
        </Parchment>
      </div>

      <div className="k-gear-side">
        <Parchment as="section" gilt className="k-card" aria-labelledby="k-purse-h">
          <h2 id="k-purse-h" className="k-h2">Purse <span className="k-h2-hint">worth {wealth % 1 ? wealth.toFixed(2) : wealth} gp</span></h2>
          <div className="k-purse">
            {COINS.map((k) => (
              <label key={k} className={`k-disc k-disc-${k}`}>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={inv.coins[k]}
                  aria-label={`${COIN_NAME[k]} pieces`}
                  onChange={(e) => inventory.setCoin(k, parseInt(e.target.value, 10) || 0)}
                  onFocus={(e) => e.target.select()}
                />
                <small aria-hidden="true">{k}</small>
              </label>
            ))}
          </div>
        </Parchment>
        <ToolKit c={c} />
        <button className="btn ghost small k-reset-inv" onClick={() => confirm('Reset coins and items to the character sheet?') && inventory.resetInventory()}>
          Reset inventory to the sheet
        </button>
      </div>
    </div>
  );
}

function ItemRow({ item, stats, inventory, onOpen }: { item: Item; stats: EquipmentInfo | null | undefined; inventory: InventoryApi; onOpen: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const save = () => {
    inventory.updateItem(item.id, { name: draft });
    setEditing(false);
  };
  const consumable = CONSUMABLE.test(item.name) && item.qty > 0;
  const move = item.qty > 1 ? (item.equipped ? 'Stow one' : 'Equip one') : item.equipped ? 'Stow' : 'Equip';

  return (
    <li className={`k-item ${item.qty === 0 ? 'empty' : ''}`}>
      <span className="k-item-name">
        {editing ? (
          <input
            className="k-item-input"
            value={draft}
            autoFocus
            aria-label="Item name"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setDraft(item.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button className="link" onClick={() => onOpen(item.name)}>{item.name}</button>
        )}
        {stats && <small>{statLine(stats)}</small>}
      </span>
      <span className="k-qty">
        <button className="k-step" onClick={() => inventory.updateItem(item.id, { qty: item.qty - 1 })} disabled={item.qty <= 0} aria-label={`One less ${item.name}`}>−</button>
        <span className="k-qty-n">{item.qty}</span>
        <button className="k-step" onClick={() => inventory.updateItem(item.id, { qty: item.qty + 1 })} aria-label={`One more ${item.name}`}>+</button>
      </span>
      <span className="k-item-acts">
        {consumable && (
          <button className="btn small" onClick={() => inventory.updateItem(item.id, { qty: item.qty - 1 })} aria-label={`Use one ${item.name}`}>Use</button>
        )}
        <button className="btn ghost small" onClick={() => inventory.moveOne(item.id)} aria-label={`${move}: ${item.name}`}>{move}</button>
        <button className="k-x" onClick={() => { setDraft(item.name); setEditing(true); }} aria-label={`Rename ${item.name}`} title="Rename">✎</button>
        <button className="k-x" onClick={() => confirm(`Remove ${item.name}?`) && inventory.removeItem(item.id)} aria-label={`Remove ${item.name}`} title="Remove">×</button>
      </span>
    </li>
  );
}
