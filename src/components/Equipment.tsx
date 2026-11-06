import { useState } from 'react';
import { COINS, type InventoryApi, type Item } from '../hooks/useInventory';
import { useEquipmentInfo } from '../hooks/useSpellInfo';
import type { EquipmentInfo } from '../lib/api';

const COIN_LABEL = { cp: 'CP', sp: 'SP', ep: 'EP', gp: 'GP', pp: 'PP' } as const;

/** "1d6 bludgeoning · Versatile (1d8)", "AC 11 + DEX", "+2 AC" */
const statLine = (s: EquipmentInfo) =>
  [s.ac, s.damage, s.versatile && `Versatile (${s.versatile})`, s.properties.join(', ')].filter(Boolean).join(' · ');

function ItemRow({
  item,
  stats,
  inventory,
  onOpen,
}: {
  item: Item;
  stats: EquipmentInfo | null | undefined;
  inventory: InventoryApi;
  onOpen: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);

  const save = () => {
    inventory.updateItem(item.id, { name: draft });
    setEditing(false);
  };
  const cancel = () => {
    setDraft(item.name);
    setEditing(false);
  };

  return (
    <li className="item-row">
      {editing ? (
        <input
          className="item-name-input"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') {
              e.stopPropagation();
              cancel();
            }
          }}
          aria-label="Item name"
        />
      ) : (
        <button className="link item-name" onClick={() => onOpen(item.name)}>{item.name}</button>
      )}
      {stats && <span className="item-stats">{statLine(stats)}</span>}
      <span className="qty">
        <button className="btn ghost small" onClick={() => inventory.updateItem(item.id, { qty: item.qty - 1 })} disabled={item.qty <= 0} aria-label={`One less ${item.name}`}>−</button>
        <span className="qty-num">×{item.qty}</span>
        <button className="btn ghost small" onClick={() => inventory.updateItem(item.id, { qty: item.qty + 1 })} aria-label={`One more ${item.name}`}>+</button>
      </span>
      <span className="item-actions">
        <button
          className="icon-btn"
          onClick={() => inventory.moveOne(item.id)}
          aria-label={
            item.qty > 1
              ? item.equipped ? `Stow one ${item.name}` : `Make one ${item.name} active`
              : item.equipped ? `Stow ${item.name}` : `Make ${item.name} active`
          }
          title={item.qty > 1 ? (item.equipped ? 'Stow one' : 'Make one active') : item.equipped ? 'Stow' : 'Make active'}
        >
          {item.equipped ? '↓' : '↑'}
        </button>
        <button className="icon-btn" onClick={() => { setDraft(item.name); setEditing(true); }} aria-label={`Rename ${item.name}`} title="Rename">✎</button>
        <button
          className="icon-btn"
          onClick={() => confirm(`Remove ${item.name}?`) && inventory.removeItem(item.id)}
          aria-label={`Remove ${item.name}`}
          title="Remove"
        >
          ×
        </button>
      </span>
    </li>
  );
}

export function Equipment({ inventory, onOpen }: { inventory: InventoryApi; onOpen: (name: string) => void }) {
  const { inv } = inventory;
  const [newName, setNewName] = useState('');
  const active = inv.items.filter((i) => i.equipped);
  const pack = inv.items.filter((i) => !i.equipped);
  const stats = useEquipmentInfo([...new Set(inv.items.map((i) => i.name))]);

  const add = () => {
    inventory.addItem(newName);
    setNewName('');
  };

  return (
    <section className="card">
      <h2>Equipment</h2>

      <div className="coins">
        {COINS.map((k) => (
          <label key={k} className={`coin coin-${k}`}>
            <span className="stat-label">{COIN_LABEL[k]}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={inv.coins[k]}
              onChange={(e) => inventory.setCoin(k, parseInt(e.target.value, 10) || 0)}
              onFocus={(e) => e.target.select()}
            />
          </label>
        ))}
      </div>

      <h3>Active</h3>
      <ul className="inventory">
        {active.map((item) => (
          <ItemRow key={item.id} item={item} stats={stats.get(item.name)} inventory={inventory} onOpen={onOpen} />
        ))}
        {active.length === 0 && <li className="muted">Nothing active.</li>}
      </ul>

      <h3>Inventory</h3>
      <ul className="inventory">
        {pack.map((item) => (
          <ItemRow key={item.id} item={item} stats={stats.get(item.name)} inventory={inventory} onOpen={onOpen} />
        ))}
        {pack.length === 0 && <li className="muted">Pack is empty.</li>}
      </ul>

      <form
        className="add-item"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add an item…" aria-label="New item name" />
        <button className="btn small" type="submit" disabled={!newName.trim()}>Add</button>
      </form>

      <button
        className="btn ghost small reset-inv"
        onClick={() => confirm('Reset coins and items to the character sheet?') && inventory.resetInventory()}
      >
        Reset to sheet
      </button>
    </section>
  );
}
