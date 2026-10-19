'use intelligence';
'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { BookOpen, Plus, Trash, Settings2, Check, AlertCircle } from 'lucide-react';

interface MenuCategory {
  id: string;
  name: string;
  description: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  taxRate: number;
  category: { id: string; name: string };
  recipe?: {
    id: string;
    description: string | null;
    recipeIngredients: Array<{
      id: string;
      inventoryItemId: string;
      quantityNeeded: number;
      inventoryItem: { name: string; unit: string };
    }>;
  } | null;
}

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
}

export default function MenuPanel() {
  const { user, token, activeRestaurantId, fetchRestaurantList } = useStore();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  // Modals
  const [showCatModal, setShowCatModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);

  // Selected Item for Recipe editing
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  // Form states
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  const [itemName, setItemName] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrice, setItemPrice] = useState(0);
  const [itemTax, setItemTax] = useState(5.0);
  const [itemCatId, setItemCatId] = useState('');
  const [itemUrl, setItemUrl] = useState('');

  // Recipe compiler state
  const [recipeDesc, setRecipeDesc] = useState('');
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ inventoryItemId: string; quantityNeeded: number }>>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
  const restaurantId = user?.restaurantId || (user?.role === 'SUPER_ADMIN' ? activeRestaurantId : '') || '';

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') fetchRestaurantList();
  }, [user, fetchRestaurantList]);

  const fetchData = async () => {
    if (!token) return;

    if (!restaurantId) {
      setLoading(false);
      return;
    }
    try {
      const [catRes, menuRes, invRes] = await Promise.all([
        fetch(`${apiUrl}/menu/categories/restaurant/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/menu/items/restaurant/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiUrl}/inventory/items/restaurant/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (catRes.ok) setCategories(await catRes.json());
      if (menuRes.ok) setMenuItems(await menuRes.json());
      if (invRes.ok) setInventoryItems(await invRes.json());
    } catch (err) {
      setError('Error pulling menu data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [restaurantId, token, apiUrl]);

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(`${apiUrl}/menu/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: catName, description: catDesc, restaurantId }),
      });

      if (!res.ok) throw new Error('Could not create category');

      setSuccess('Menu category added!');
      setShowCatModal(false);
      setCatName('');
      setCatDesc('');
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(`${apiUrl}/menu/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: itemName,
          description: itemDesc,
          price: Number(itemPrice),
          imageUrl: itemUrl || undefined,
          taxRate: Number(itemTax),
          categoryId: itemCatId,
        }),
      });

      if (!res.ok) throw new Error('Could not create menu item');

      setSuccess('Menu item added!');
      setShowItemModal(false);
      setItemName('');
      setItemDesc('');
      setItemPrice(0);
      setItemUrl('');
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      const res = await fetch(`${apiUrl}/menu/items/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isAvailable: !item.isAvailable }),
      });

      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  // Open recipe manager
  const openRecipeEditor = (item: MenuItem) => {
    setSelectedItem(item);
    setRecipeDesc(item.recipe?.description || '');
    
    const existingIngredients = item.recipe?.recipeIngredients.map((ri) => ({
      inventoryItemId: ri.inventoryItemId,
      quantityNeeded: ri.quantityNeeded,
    })) || [];
    
    setRecipeIngredients(existingIngredients);
    setShowRecipeModal(true);
  };

  const addRecipeRow = () => {
    setRecipeIngredients((prev) => [...prev, { inventoryItemId: '', quantityNeeded: 0 }]);
  };

  const removeRecipeRow = (index: number) => {
    setRecipeIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRecipeRow = (index: number, key: 'inventoryItemId' | 'quantityNeeded', val: any) => {
    setRecipeIngredients((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [key]: val } : row)),
    );
  };

  const saveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    setError('');
    const payload = {
      description: recipeDesc,
      ingredients: recipeIngredients.filter((ri) => ri.inventoryItemId && ri.quantityNeeded > 0),
    };

    try {
      const res = await fetch(`${apiUrl}/menu/items/${selectedItem.id}/recipe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to update recipe matrix');

      setSuccess('Recipe map updated successfully!');
      setShowRecipeModal(false);
      setSelectedItem(null);
      fetchData();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Loading Kitchen Recipes...</p>
      </div>
    );
  }

  if (!restaurantId) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-2 text-center px-4">
        <p className="text-sm font-semibold text-white">No restaurant assigned</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Your account isn&apos;t linked to a specific restaurant outlet, so there&apos;s no
          menu or recipes to show here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Menu & Recipe Manager</h1>
          <p className="text-slate-400 text-sm mt-0.5">Configure restaurant categories, item listings, and recipe ingredient allocations</p>
        </div>

        <div className="flex gap-2 text-xs self-start sm:self-center">
          <button
            onClick={() => setShowCatModal(true)}
            className="px-3.5 py-2.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-350 hover:text-white font-semibold flex items-center gap-1.5 transition"
          >
            <Plus className="h-4 w-4" /> Add Category
          </button>
          <button
            onClick={() => setShowItemModal(true)}
            className="px-3.5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 transition shadow shadow-indigo-600/10"
          >
            <Plus className="h-4 w-4" /> Add Menu Item
          </button>
        </div>
      </div>

      {success && (
        <div className="p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
          {success}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg border border-rose-500/20 bg-red-500/10 text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Categories & Items Listing */}
      <div className="space-y-8">
        {categories.map((cat) => {
          const catItems = menuItems.filter((i) => i.category?.id === cat.id);
          return (
            <div key={cat.id} className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="text-base font-bold text-white tracking-wide">{cat.name}</h3>
                {cat.description && <p className="text-slate-550 text-xs mt-0.5">{cat.description}</p>}
              </div>

              {/* Items Grid */}
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur flex flex-col justify-between h-48 hover:border-slate-750 transition"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <h4 className="text-sm font-extrabold text-white">{item.name}</h4>
                        <span className="text-xs text-indigo-400 font-bold">${item.price.toFixed(2)}</span>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">{item.description || 'No description provided.'}</p>
                    </div>

                    <div className="flex justify-between items-center border-t border-slate-800/60 pt-3">
                      {/* Availability toggle */}
                      <button
                        onClick={() => toggleAvailability(item)}
                        className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase transition ${
                          item.isAvailable
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {item.isAvailable ? 'Available' : 'Disabled'}
                      </button>

                      {/* Recipe Link button */}
                      <button
                        onClick={() => openRecipeEditor(item)}
                        className="text-xs text-slate-400 hover:text-white flex items-center gap-1 font-semibold transition"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        {item.recipe ? 'Edit Recipe' : 'Add Recipe'}
                      </button>
                    </div>
                  </div>
                ))}
                {catItems.length === 0 && (
                  <p className="text-xs text-slate-500 col-span-3 py-4">No items listed in this category.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODALS */}
      {/* 1. Add Category */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={addCategory} className="w-full max-w-md rounded-xl border border-slate-850 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Create Menu Category</h3>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Category Name</label>
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                required
                placeholder="e.g. Desserts, Starters, Beverages"
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Description</label>
              <input
                type="text"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                placeholder="Brief description"
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCatModal(false)}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-855 text-slate-355 hover:text-white rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Create Category
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Add Menu Item */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={addMenuItem} className="w-full max-w-md rounded-xl border border-slate-850 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Create Menu Item</h3>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Select Category</label>
              <select
                value={itemCatId}
                onChange={(e) => setItemCatId(e.target.value)}
                required
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">-- Choose category --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Item Name</label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                required
                placeholder="e.g. Margherita Pizza"
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Base Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={itemPrice}
                  onChange={(e) => setItemPrice(Number(e.target.value))}
                  required
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={itemTax}
                  onChange={(e) => setItemTax(Number(e.target.value))}
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Description</label>
              <input
                type="text"
                value={itemDesc}
                onChange={(e) => setItemDesc(e.target.value)}
                placeholder="Details about ingredients and preparation"
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-650 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-850 text-slate-355 hover:text-white rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Create Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Recipe Editor Dialog */}
      {showRecipeModal && selectedItem && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={saveRecipe} className="w-full max-w-lg rounded-xl border border-slate-850 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <div>
              <h3 className="font-extrabold text-base text-white">Recipe Sheet: {selectedItem.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Map inventory raw materials consumed per serving</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Preparation Instructions</label>
              <input
                type="text"
                value={recipeDesc}
                onChange={(e) => setRecipeDesc(e.target.value)}
                placeholder="Optional instructions..."
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Ingredients rows */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              <div className="flex justify-between items-center border-b border-slate-850 pb-1 text-[10px] font-bold text-slate-400 uppercase">
                <span>Select Ingredient</span>
                <span>Qty Consumed</span>
              </div>

              {recipeIngredients.map((ri, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <select
                    value={ri.inventoryItemId}
                    onChange={(e) => updateRecipeRow(index, 'inventoryItemId', e.target.value)}
                    required
                    className="flex-1 text-xs bg-slate-950 border border-slate-850 rounded-lg p-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Choose ingredient --</option>
                    {inventoryItems.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                    ))}
                  </select>

                  <input
                    type="number"
                    step="0.001"
                    placeholder="Qty"
                    value={ri.quantityNeeded || ''}
                    onChange={(e) => updateRecipeRow(index, 'quantityNeeded', Number(e.target.value))}
                    required
                    className="w-24 text-xs bg-slate-950 border border-slate-850 rounded-lg p-2 text-white text-center focus:outline-none focus:border-indigo-500"
                  />

                  <button
                    type="button"
                    onClick={() => removeRecipeRow(index)}
                    className="p-2 bg-slate-950 hover:bg-rose-900/20 text-slate-400 hover:text-rose-400 border border-slate-850 rounded-lg transition"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addRecipeRow}
                className="w-full py-2 border border-dashed border-slate-800 hover:border-slate-700 hover:bg-slate-950 text-xs font-semibold text-slate-400 hover:text-white rounded-lg transition"
              >
                + Add Ingredient Row
              </button>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRecipeModal(false);
                  setSelectedItem(null);
                }}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-855 text-slate-355 hover:text-white rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Save Recipe Map
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
