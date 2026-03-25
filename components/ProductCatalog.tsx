import React, { useState, useEffect } from 'react';
import { fetchTemplates, saveTemplate, deleteTemplate, fetchCategories, addCategory, removeCategory } from '../services/voucherService';
import { VoucherTemplate } from '../types';
import { Plus, Edit, Trash, Package, Calendar, Settings, Image as ImageIcon, FileText, Eye, EyeOff } from 'lucide-react';

export const ProductCatalog: React.FC = () => {
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [editing, setEditing] = useState<Partial<VoucherTemplate> | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  
  // Filter State
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    const data = await fetchTemplates();
    const cats = await fetchCategories();
    setTemplates(data);
    setCategories(cats);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (editing && editing.name && editing.value && editing.category) {
      const template: VoucherTemplate = {
        id: editing.id || crypto.randomUUID(),
        name: editing.name,
        category: editing.category,
        value: Number(editing.value),
        isActive: editing.isActive ?? true,
        defaultExpiryDate: editing.defaultExpiryDate || undefined,
        terms: editing.terms || '',
        image: editing.image
      };
      await saveTemplate(template);
      setEditing(null);
      load();
    }
  };

  const handleDelete = async (id: string) => {
      if(confirm('Delete this product?')) {
          await deleteTemplate(id);
          load();
      }
  };

  const handleAddCategory = async () => {
      if (newCategory) {
          await addCategory(newCategory);
          setNewCategory('');
          load();
      }
  };

  const handleRemoveCategory = async (cat: string) => {
      if(confirm(`Delete category "${cat}"?`)) {
          await removeCategory(cat);
          load();
      }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && editing) {
        if (file.size > 500000) { // 500kb limit check
            alert("Image is too large. Please use an image under 500KB.");
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setEditing({ ...editing, image: reader.result as string });
        };
        reader.readAsDataURL(file);
    }
  };

  const displayedTemplates = showInactive ? templates : templates.filter(t => t.isActive);

  // High visibility styles
  const labelClass = "block text-xs font-extrabold text-gray-800 mb-1.5 uppercase tracking-wide";
  const inputClass = "w-full border-2 border-gray-300 rounded-lg p-3 text-sm bg-white text-gray-900 font-medium focus:ring-4 focus:ring-primary-100 focus:border-primary-500 outline-none transition-all";
  
  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
            <h1 className="text-3xl font-extrabold text-primary-900 tracking-tight">Product Catalog</h1>
            <p className="text-gray-500 font-medium">Manage vouchers available for sale.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
            {/* Inactive Toggle */}
            <button 
                onClick={() => setShowInactive(!showInactive)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border transition-colors ${showInactive ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            >
                {showInactive ? <Eye size={18} /> : <EyeOff size={18} />}
                {showInactive ? 'Showing Hidden' : 'Show Hidden Items'}
            </button>

            <button 
                onClick={() => setIsCategoryModalOpen(true)}
                className="bg-white border border-gray-300 text-gray-700 font-bold px-4 py-2.5 rounded-lg flex items-center gap-2 hover:bg-gray-50 shadow-sm"
            >
                <Settings size={18} /> Categories
            </button>
            <button 
                onClick={() => setEditing({ isActive: true, category: categories[0] || 'General', defaultExpiryDate: '2025-12-31', terms: '' })}
                className="bg-primary-600 text-white px-5 py-2.5 font-bold rounded-lg flex items-center gap-2 hover:bg-primary-700 shadow-md transition-transform active:scale-95"
            >
                <Plus size={20} /> Add Product
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedTemplates.map(t => (
          <div key={t.id} className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative group hover:shadow-md transition-shadow ${!t.isActive ? 'opacity-75 bg-gray-50 ring-2 ring-gray-100' : ''}`}>
             <div className="h-48 bg-gray-100 relative">
                 {t.image ? (
                     <img src={t.image} alt={t.name} className="w-full h-full object-cover" />
                 ) : (
                     <div className="flex items-center justify-center h-full text-gray-300 bg-gray-100">
                         <ImageIcon size={48} />
                     </div>
                 )}
                 
                 {/* Floating Actions */}
                 <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditing(t)} className="p-2 bg-white text-blue-600 rounded-full shadow-lg hover:bg-blue-50 transition-colors"><Edit size={16} /></button>
                    <button onClick={() => handleDelete(t.id)} className="p-2 bg-white text-red-500 rounded-full shadow-lg hover:bg-red-50 transition-colors"><Trash size={16} /></button>
                 </div>
                 
                 <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded shadow-sm uppercase tracking-wide">
                     {t.category}
                 </div>
                 {!t.isActive && (
                    <div className="absolute inset-0 bg-gray-900/10 flex items-center justify-center pointer-events-none">
                        <span className="bg-gray-800 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">Not For Sale</span>
                    </div>
                 )}
             </div>
             
             <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-extrabold text-gray-900 leading-tight">{t.name}</h3>
                </div>
                
                {t.defaultExpiryDate && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-4 bg-gray-50 w-fit px-2 py-1 rounded">
                        <Calendar size={14}/> Expires: {t.defaultExpiryDate}
                    </div>
                )}
                
                <p className="text-sm text-gray-600 line-clamp-2 mb-4 min-h-[40px] italic">
                    {t.terms || "No specific terms."}
                </p>

                <div className="flex justify-between items-center mt-auto pt-4 border-t border-gray-100">
                    <span className="text-2xl font-extrabold text-primary-700">${t.value}</span>
                    <button onClick={() => setEditing(t)} className="text-sm font-bold text-gray-500 hover:text-primary-600 flex items-center gap-1">
                        Edit Details
                    </button>
                </div>
             </div>
          </div>
        ))}
        {displayedTemplates.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-400 font-medium bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                <Package size={48} className="mx-auto mb-4 opacity-50" />
                <p>No products found.</p>
                {showInactive ? <p className="text-sm">Try adding a new product.</p> : <p className="text-sm">Check "Show Hidden Items" to see inactive products.</p>}
            </div>
        )}
      </div>

      {/* Edit Modal - High Visibility */}
      {editing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in duration-200">
                <div className="p-6 border-b bg-gray-50 rounded-t-2xl">
                    <h3 className="text-2xl font-extrabold text-gray-900">{editing.id ? 'Edit Product' : 'New Product'}</h3>
                    <p className="text-sm text-gray-500 font-medium">Fill in the details below. All fields marked are important.</p>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-6">
                    <div>
                        <label className={labelClass}>Voucher Name</label>
                        <input className={inputClass} value={editing.name || ''} onChange={e => setEditing({...editing, name: e.target.value})} placeholder="e.g. Deluxe Stay Package" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className={labelClass}>Category</label>
                            <select className={inputClass} value={editing.category || ''} onChange={e => setEditing({...editing, category: e.target.value})}>
                                <option value="">Select Category...</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelClass}>Value ($)</label>
                            <input type="number" className={inputClass} value={editing.value || ''} onChange={e => setEditing({...editing, value: Number(e.target.value)})} placeholder="0.00" />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Default Expiry Date</label>
                        <input 
                            type="date" 
                            className={inputClass} 
                            style={{ colorScheme: 'light' }}
                            value={editing.defaultExpiryDate || ''} 
                            onChange={e => setEditing({...editing, defaultExpiryDate: e.target.value})} 
                        />
                        <p className="text-xs text-gray-400 mt-1 font-medium">* Sales terminal will default to this date.</p>
                    </div>

                    <div>
                        <label className={labelClass}>Terms & Conditions</label>
                        <textarea 
                            rows={4}
                            className={inputClass} 
                            value={editing.terms || ''} 
                            onChange={e => setEditing({...editing, terms: e.target.value})} 
                            placeholder="Enter terms and conditions here..."
                        />
                    </div>

                    <div>
                        <label className={labelClass}>Poster Image (Max 500KB)</label>
                        <div className="flex gap-4 items-center bg-gray-50 p-3 rounded-lg border border-gray-200">
                            {editing.image ? (
                                <img src={editing.image} alt="Preview" className="h-16 w-16 object-cover rounded border border-gray-300" />
                            ) : (
                                <div className="h-16 w-16 bg-gray-200 rounded flex items-center justify-center text-gray-400">
                                    <ImageIcon size={24} />
                                </div>
                            )}
                            <div className="flex-1">
                                <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-2 px-4 rounded-lg inline-block transition-colors text-sm">
                                    Choose File
                                    <input 
                                        type="file" 
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="hidden"
                                    />
                                </label>
                                <span className="ml-3 text-xs text-gray-500 font-medium">{editing.image ? 'Image Selected' : 'No file chosen'}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-gray-100 p-4 rounded-xl flex items-center justify-between cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => setEditing({...editing, isActive: !editing.isActive})}>
                        <div>
                            <span className="block text-sm font-extrabold text-gray-900 uppercase">Availability Status</span>
                            <span className="text-xs text-gray-500 font-medium">{editing.isActive ? 'Product is visible in Sales Terminal' : 'Product is HIDDEN from Sales Terminal'}</span>
                        </div>
                        <div className={`w-14 h-7 flex items-center rounded-full p-1 duration-300 ease-in-out ${editing.isActive ? 'bg-green-500' : 'bg-gray-400'}`}>
                            <div className={`bg-white w-5 h-5 rounded-full shadow-md transform duration-300 ease-in-out ${editing.isActive ? 'translate-x-7' : ''}`}></div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 p-6 border-t bg-gray-50 rounded-b-2xl">
                    <button onClick={() => setEditing(null)} className="px-5 py-3 text-gray-600 hover:bg-gray-200 rounded-xl font-bold transition-colors">Cancel</button>
                    <button onClick={handleSave} className="px-8 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-bold shadow-lg transition-all active:scale-95">Save Product</button>
                </div>
            </div>
        </div>
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 animate-in zoom-in duration-200">
                  <h3 className="text-xl font-extrabold text-gray-900 mb-6">Manage Categories</h3>
                  
                  <div className="flex gap-2 mb-6">
                      <input 
                        className="flex-1 border-2 border-gray-300 p-3 rounded-lg font-bold text-gray-800 focus:border-primary-500 outline-none" 
                        placeholder="New Category Name" 
                        value={newCategory} 
                        onChange={e => setNewCategory(e.target.value)}
                      />
                      <button onClick={handleAddCategory} className="bg-green-600 text-white px-4 rounded-lg hover:bg-green-700 font-bold shadow-md transition-colors"><Plus size={24}/></button>
                  </div>

                  <ul className="space-y-3 max-h-60 overflow-y-auto pr-1">
                      {categories.map(cat => (
                          <li key={cat} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200 font-medium text-gray-700">
                              <span>{cat}</span>
                              <button onClick={() => handleRemoveCategory(cat)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors"><Trash size={18}/></button>
                          </li>
                      ))}
                  </ul>

                  <button onClick={() => setIsCategoryModalOpen(false)} className="w-full mt-8 bg-gray-100 text-gray-800 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors">Close</button>
              </div>
          </div>
      )}
    </div>
  );
};