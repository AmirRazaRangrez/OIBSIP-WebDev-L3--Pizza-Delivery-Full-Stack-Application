// client/src/pages/PizzaBuilder.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ShoppingBag, Check, AlertCircle, Loader2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function PizzaBuilder() {
  const [grouped, setGrouped] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // 4 Steps: 1 = Base, 2 = Sauce, 3 = Cheese, 4 = Veggies
  const [step, setStep] = useState(1);
  const [selectedBase, setSelectedBase] = useState(null);
  const [selectedSauce, setSelectedSauce] = useState(null);
  const [selectedCheese, setSelectedCheese] = useState(null);
  const [selectedVeggies, setSelectedVeggies] = useState([]);

  const { addToCart } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    api.getGroupedInventory()
      .then((data) => {
        if (isMounted) {
          setGrouped(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load inventory for builder:', err);
        if (isMounted) {
          setError('Could not load fresh ingredients. Please try again.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute live price
  const basePrice = selectedBase?.price || 0;
  const saucePrice = selectedSauce?.price || 0;
  const cheesePrice = selectedCheese?.price || 0;
  const veggiesPrice = selectedVeggies.reduce((sum, v) => sum + (v.price || 0), 0);
  const totalPrice = basePrice + saucePrice + cheesePrice + veggiesPrice;

  const toggleVeggie = (veggie) => {
    if (veggie.stock <= 0) return;
    const exists = selectedVeggies.some((v) => v._id === veggie._id);
    if (exists) {
      setSelectedVeggies(selectedVeggies.filter((v) => v._id !== veggie._id));
    } else {
      setSelectedVeggies([...selectedVeggies, veggie]);
    }
  };

  const handleNext = () => {
    if (step === 1 && !selectedBase) {
      setError('Please select a pizza base before proceeding.');
      return;
    }
    if (step === 2 && !selectedSauce) {
      setError('Please select a sauce before proceeding.');
      return;
    }
    if (step === 3 && !selectedCheese) {
      setError('Please select a cheese option before proceeding.');
      return;
    }
    setError('');
    setStep((prev) => prev + 1);
  };

  const handlePrev = () => {
    setError('');
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleFinishCustomPizza = () => {
    if (!selectedBase || !selectedSauce || !selectedCheese) {
      setError('Please ensure base, sauce, and cheese are selected.');
      return;
    }

    const customPizza = {
      type: 'custom',
      name: `Custom Pizza (${selectedBase.name})`,
      price: totalPrice,
      quantity: 1,
      customDetails: {
        base: selectedBase._id,
        sauce: selectedSauce._id,
        cheese: selectedCheese._id,
        veggies: selectedVeggies.map((v) => v._id)
      },
      summary: {
        baseName: selectedBase.name,
        sauceName: selectedSauce.name,
        cheeseName: selectedCheese.name,
        veggieNames: selectedVeggies.map((v) => v.name)
      }
    };

    addToCart(customPizza);
    navigate('/order-summary');
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: 'center', padding: '100px 0' }}>
        <Loader2 size={40} className="animate-spin" color="var(--color-primary)" style={{ margin: '0 auto 16px' }} />
        <h3>Loading Pizza Customizer Workshop...</h3>
      </div>
    );
  }

  const bases = grouped?.bases || [];
  const sauces = grouped?.sauces || [];
  const cheeses = grouped?.cheeses || [];
  const veggies = grouped?.veggies || [];

  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800' }}>Custom Pizza Architect</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          Design your custom handcrafted masterpiece in 4 simple steps
        </p>
      </div>

      <div className="wizard-container">
        {/* Step Progression Bar */}
        <div className="wizard-steps">
          <div
            className={`step-indicator ${step === 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}
            onClick={() => step > 1 && setStep(1)}
          >
            <div className="step-circle">{step > 1 ? <Check size={16} /> : 1}</div>
            <span className="step-title">1. Base ({bases.length} Options)</span>
          </div>

          <div
            className={`step-indicator ${step === 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}
            onClick={() => step > 2 && setStep(2)}
          >
            <div className="step-circle">{step > 2 ? <Check size={16} /> : 2}</div>
            <span className="step-title">2. Sauce ({sauces.length} Options)</span>
          </div>

          <div
            className={`step-indicator ${step === 3 ? 'active' : ''} ${step > 3 ? 'completed' : ''}`}
            onClick={() => step > 3 && setStep(3)}
          >
            <div className="step-circle">{step > 3 ? <Check size={16} /> : 3}</div>
            <span className="step-title">3. Cheese</span>
          </div>

          <div className={`step-indicator ${step === 4 ? 'active' : ''}`}>
            <div className="step-circle">4</div>
            <span className="step-title">4. Fresh Veggies</span>
          </div>
        </div>

        {error && (
          <div style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Base Selection */}
        {step === 1 && (
          <div>
            <h3 style={{ marginBottom: '16px', fontWeight: '700' }}>Choose Your Dough & Crust (1 Required)</h3>
            <div className="ingredient-grid">
              {bases.map((item) => {
                const isSelected = selectedBase?._id === item._id;
                const isOutOfStock = item.stock <= 0;
                return (
                  <div
                    key={item._id}
                    className={`ingredient-card ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
                    onClick={() => !isOutOfStock && setSelectedBase(item)}
                  >
                    <div>
                      <div className="ingredient-name">{item.name}</div>
                      <div className="ingredient-stock">
                        {isOutOfStock ? 'Sold Out' : `${item.stock} left in stock`}
                      </div>
                    </div>
                    <div className="ingredient-price">₹{item.price}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Sauce Selection */}
        {step === 2 && (
          <div>
            <h3 style={{ marginBottom: '16px', fontWeight: '700' }}>Choose Your Base Sauce (1 Required)</h3>
            <div className="ingredient-grid">
              {sauces.map((item) => {
                const isSelected = selectedSauce?._id === item._id;
                const isOutOfStock = item.stock <= 0;
                return (
                  <div
                    key={item._id}
                    className={`ingredient-card ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
                    onClick={() => !isOutOfStock && setSelectedSauce(item)}
                  >
                    <div>
                      <div className="ingredient-name">{item.name}</div>
                      <div className="ingredient-stock">
                        {isOutOfStock ? 'Sold Out' : `${item.stock} left in stock`}
                      </div>
                    </div>
                    <div className="ingredient-price">₹{item.price}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Cheese Selection */}
        {step === 3 && (
          <div>
            <h3 style={{ marginBottom: '16px', fontWeight: '700' }}>Select Your Cheese Layer (1 Required)</h3>
            <div className="ingredient-grid">
              {cheeses.map((item) => {
                const isSelected = selectedCheese?._id === item._id;
                const isOutOfStock = item.stock <= 0;
                return (
                  <div
                    key={item._id}
                    className={`ingredient-card ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
                    onClick={() => !isOutOfStock && setSelectedCheese(item)}
                  >
                    <div>
                      <div className="ingredient-name">{item.name}</div>
                      <div className="ingredient-stock">
                        {isOutOfStock ? 'Sold Out' : `${item.stock} left in stock`}
                      </div>
                    </div>
                    <div className="ingredient-price">₹{item.price}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 4: Vegetables Selection (Multiple) */}
        {step === 4 && (
          <div>
            <h3 style={{ marginBottom: '16px', fontWeight: '700' }}>Select Your Fresh Vegetable Toppings (Multiple)</h3>
            <div className="ingredient-grid">
              {veggies.map((item) => {
                const isSelected = selectedVeggies.some((v) => v._id === item._id);
                const isOutOfStock = item.stock <= 0;
                return (
                  <div
                    key={item._id}
                    className={`ingredient-card ${isSelected ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
                    onClick={() => toggleVeggie(item)}
                  >
                    <div>
                      <div className="ingredient-name">{item.name}</div>
                      <div className="ingredient-stock">
                        {isOutOfStock ? 'Sold Out' : `${item.stock} left in stock`}
                      </div>
                    </div>
                    <div className="ingredient-price">₹{item.price}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Live Bottom Action Bar */}
        <div className="wizard-sticky-bar">
          <div className="running-total">
            <span>Live Custom Pizza Price</span>
            <strong>₹{totalPrice}</strong>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            {step > 1 && (
              <button onClick={handlePrev} className="btn btn-outline">
                <ArrowLeft size={16} />
                <span>Previous Step</span>
              </button>
            )}

            {step < 4 ? (
              <button onClick={handleNext} className="btn btn-primary">
                <span>Continue to Step {step + 1}</span>
                <ArrowRight size={16} />
              </button>
            ) : (
              <button onClick={handleFinishCustomPizza} className="btn btn-primary btn-lg">
                <ShoppingBag size={18} />
                <span>Add Custom Pizza to Cart (₹{totalPrice})</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

