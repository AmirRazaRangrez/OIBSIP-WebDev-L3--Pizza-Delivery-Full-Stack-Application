// client/src/pages/Dashboard.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Plus, Check, Loader2, UtensilsCrossed } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const [pizzas, setPizzas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addedIds, setAddedIds] = useState({});
  const { addToCart } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    api.getPizzas()
      .then((data) => {
        if (isMounted) {
          setPizzas(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load pizzas:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleAddToCart = (pizza) => {
    addToCart({
      type: 'preconfigured',
      pizzaId: pizza._id,
      name: pizza.name,
      price: pizza.price,
      quantity: 1,
      description: pizza.description,
      image: pizza.image || pizza.imageUrl,
      imageUrl: pizza.imageUrl || pizza.image
    });

    setAddedIds((prev) => ({ ...prev, [pizza._id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [pizza._id]: false }));
    }, 1500);
  };

  return (
    <div>
      {/* Zomato Hero Section */}
      <section className="hero-banner">
        <div className="container hero-content">
          <div className="hero-text">
            <h1>Craving Handcrafted Artisanal Pizza?</h1>
            <p>
              Choose from chef-curated classics or engineer your bespoke custom pizza across 4 sequential steps with fresh daily ingredients.
            </p>
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <Link to="/build-pizza" className="btn btn-primary btn-lg">
                <Sparkles size={18} />
                <span>Build Custom Pizza</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog */}
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '800' }}>Signature Chef Creations</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>
              Authentic Italian dough varieties baked to golden perfection
            </p>
          </div>
          <Link to="/build-pizza" className="btn btn-outline btn-sm">
            <span>Or Customize Your Own</span>
          </Link>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Loader2 size={36} className="animate-spin" color="var(--color-primary)" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--color-text-muted)' }}>Loading gourmet catalog...</p>
          </div>
        ) : !Array.isArray(pizzas) || pizzas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', background: '#fff', borderRadius: 'var(--radius-lg)' }}>
            <UtensilsCrossed size={48} color="var(--color-text-muted)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: '600' }}>No signature pizzas available currently.</p>
            <Link to="/build-pizza" className="btn btn-primary" style={{ marginTop: '16px' }}>
              Build a Custom Pizza Instead
            </Link>
          </div>
        ) : (
          <div className="pizza-grid">
            {pizzas.map((pizza) => {
              const isAdded = !!addedIds[pizza._id];
              return (
                <div key={pizza._id} className="pizza-card">
                  <div className="pizza-image-wrap">
                    <img
                      src={pizza.image || pizza.imageUrl || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=600&q=80'}
                      alt={pizza.name}
                      className="pizza-image"
                    />
                    <div className="pizza-veg-tag" title="Vegetarian" />
                  </div>

                  <div className="pizza-details">
                    <h3>{pizza.name}</h3>
                    <p>{pizza.description}</p>

                    <div className="pizza-footer">
                      <div className="pizza-price">₹{pizza.price}</div>
                      <button
                        onClick={() => handleAddToCart(pizza)}
                        className={`btn btn-sm ${isAdded ? 'btn-success' : 'btn-primary'}`}
                      >
                        {isAdded ? (
                          <>
                            <Check size={14} />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <Plus size={14} />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

