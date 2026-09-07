'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function SellPage() {
  // รายการสินค้าทั้งหมด (ไว้แสดงใน dropdown)
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // ตะกร้าสินค้า: [{ productId, sku, name, price, unit, quantity, stock }]
  const [cart, setCart] = useState([]);

  // ฟอร์มสำหรับเพิ่มสินค้าลงตะกร้า
  const [selectedProductId, setSelectedProductId] = useState('');
  const [addQuantity, setAddQuantity] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    setLoading(true);
    setErrorMsg('');
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setErrorMsg('โหลดข้อมูลสินค้าไม่สำเร็จ: ' + error.message);
    } else {
      setProducts(data);
    }
    setLoading(false);
  }

  // ยอดรวมทั้งตะกร้า
  const cartTotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  // เพิ่มสินค้าที่เลือกลงตะกร้า
  function handleAddToCart(e) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const product = products.find((p) => p.id === selectedProductId);
    const qty = parseInt(addQuantity, 10);

    if (!product) {
      setErrorMsg('กรุณาเลือกสินค้า');
      return;
    }
    if (!qty || qty <= 0) {
      setErrorMsg('กรุณากรอกจำนวนที่ถูกต้อง');
      return;
    }

    // จำนวนที่มีอยู่แล้วในตะกร้าของสินค้าตัวนี้ (ถ้ามี)
    const existingItem = cart.find((item) => item.productId === product.id);
    const alreadyInCart = existingItem ? existingItem.quantity : 0;

    // ตรวจสอบ stock รวม (ของเดิมในตะกร้า + ที่จะเพิ่ม) ไม่เกินคงเหลือ
    if (alreadyInCart + qty > product.stock) {
      setErrorMsg(
        `สินค้า "${product.name}" คงเหลือ ${product.stock} ${product.unit} (ในตะกร้ามีแล้ว ${alreadyInCart})`
      );
      return;
    }

    if (existingItem) {
      // ถ้ามีสินค้านี้ในตะกร้าแล้ว ให้บวกจำนวนเพิ่ม
      setCart((prev) =>
        prev.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + qty }
            : item
        )
      );
    } else {
      // เพิ่มเป็นรายการใหม่ในตะกร้า
      setCart((prev) => [
        ...prev,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          unit: product.unit,
          quantity: qty,
          stock: product.stock,
        },
      ]);
    }

    // รีเซ็ตฟอร์มเพิ่มสินค้า
    setSelectedProductId('');
    setAddQuantity('');
  }

  // ลบรายการออกจากตะกร้า
  function handleRemoveFromCart(productId) {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  }

  // แก้จำนวนของรายการในตะกร้าโดยตรง
  function handleChangeCartQuantity(productId, newQty) {
    const qty = parseInt(newQty, 10);
    setCart((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: isNaN(qty) ? 0 : qty }
          : item
      )
    );
  }

  function clearCart() {
    setCart([]);
  }

  // ยืนยันการขายทั้งตะกร้า
  async function handleCheckout() {
    setErrorMsg('');
    setSuccessMsg('');

    if (cart.length === 0) {
      setErrorMsg('ยังไม่มีสินค้าในตะกร้า');
      return;
    }
    if (cart.some((item) => !item.quantity || item.quantity <= 0)) {
      setErrorMsg('มีรายการที่จำนวนไม่ถูกต้อง กรุณาตรวจสอบ');
      return;
    }

    setCheckingOut(true);

    // ตรวจสอบ stock ล่าสุดของทุกสินค้าในตะกร้าก่อนบันทึกจริง
    for (const item of cart) {
      const { data: latestProduct, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('id', item.productId)
        .single();

      if (fetchError || !latestProduct) {
        setErrorMsg(`ไม่พบข้อมูลสินค้า "${item.name}" กรุณาลองใหม่`);
        setCheckingOut(false);
        return;
      }
      if (latestProduct.stock < item.quantity) {
        setErrorMsg(
          `สินค้า "${item.name}" คงเหลือไม่พอ (คงเหลือ ${latestProduct.stock} ${latestProduct.unit})`
        );
        setCheckingOut(false);
        return;
      }
    }

    // บันทึกทีละรายการ: insert ลง sales + update stock ใน products
    for (const item of cart) {
      const total = item.price * item.quantity;

      const { error: saleError } = await supabase.from('sales').insert([
        {
          product_id: item.productId,
          product_name: item.name,
          quantity: item.quantity,
          total_price: total,
          sold_at: new Date().toISOString(),
        },
      ]);

      if (saleError) {
        setErrorMsg(`บันทึกการขาย "${item.name}" ไม่สำเร็จ: ${saleError.message}`);
        setCheckingOut(false);
        fetchProducts();
        return;
      }

      // ลด stock ตามจำนวนที่ขาย (คำนวณจาก stock ปัจจุบันใน products)
      const { data: currentProduct } = await supabase
        .from('products')
        .select('stock')
        .eq('id', item.productId)
        .single();

      const newStock = (currentProduct?.stock ?? item.stock) - item.quantity;

      const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock })
        .eq('id', item.productId);

      if (updateError) {
        setErrorMsg(`อัปเดตสต็อก "${item.name}" ไม่สำเร็จ: ${updateError.message}`);
        setCheckingOut(false);
        fetchProducts();
        return;
      }
    }

    setSuccessMsg(
      `ขายสำเร็จ ${cart.length} รายการ รวม ${cartTotal.toFixed(2)} บาท`
    );
    clearCart();
    fetchProducts();
    setCheckingOut(false);
  }

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {/* ยอดรวมตัวใหญ่ ไว้บนสุด เห็นชัดทั้งฝั่งผู้ขายและลูกค้า */}
      <div className="total-banner">
        <div className="total-banner-label">ยอดรวมทั้งหมด</div>
        <div className="total-banner-amount">{cartTotal.toFixed(2)} บาท</div>
      </div>

      {errorMsg && <p className="error-text">{errorMsg}</p>}
      {successMsg && <p className="success-text">{successMsg}</p>}

      {/* ฟอร์มเพิ่มสินค้าลงตะกร้า */}
      <div className="card">
        <h2>เพิ่มสินค้า</h2>
        {loading ? (
          <p>กำลังโหลดข้อมูลสินค้า...</p>
        ) : (
          <form onSubmit={handleAddToCart}>
            <div className="form-row">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                <option value="">-- เลือกสินค้า --</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.price} บาท/{product.unit}) - คงเหลือ {product.stock}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="จำนวน"
                min="1"
                className="qty-input"
                value={addQuantity}
                onChange={(e) => setAddQuantity(e.target.value)}
              />

              <button type="submit">+ เพิ่มลงตะกร้า</button>
            </div>
          </form>
        )}
      </div>

      {/* ตะกร้าสินค้า */}
      <div className="card">
        <h2>รายการที่จะขาย</h2>

        {cart.length === 0 ? (
          <p>ยังไม่มีสินค้าในตะกร้า</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>ชื่อสินค้า</th>
                  <th>ราคา/หน่วย</th>
                  <th>จำนวน</th>
                  <th>รวม</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <tr key={item.productId}>
                    <td>{item.name}</td>
                    <td>{item.price} บาท/{item.unit}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        className="qty-input"
                        value={item.quantity}
                        onChange={(e) =>
                          handleChangeCartQuantity(item.productId, e.target.value)
                        }
                      />
                    </td>
                    <td>{(item.price * item.quantity).toFixed(2)} บาท</td>
                    <td>
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveFromCart(item.productId)}
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="checkout-row">
              <button className="clear-btn" onClick={clearCart} disabled={checkingOut}>
                ล้างตะกร้า
              </button>
              <button
                className="checkout-btn"
                onClick={handleCheckout}
                disabled={checkingOut}
              >
                {checkingOut ? 'กำลังบันทึกการขาย...' : `ยืนยันการขาย (${cartTotal.toFixed(2)} บาท)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
