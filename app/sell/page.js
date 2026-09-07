'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function SellPage() {
  // รายการสินค้าทั้งหมด (ไว้แสดงใน dropdown)
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // สินค้าที่เลือกและจำนวนที่จะขาย
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [selling, setSelling] = useState(false);

  // โหลดสินค้าตอนเปิดหน้า
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

  // หาข้อมูลสินค้าที่กำลังเลือกอยู่ (ใช้คำนวณยอดรวม)
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  // คำนวณยอดรวม = ราคา x จำนวน
  const quantityNumber = parseInt(quantity, 10) || 0;
  const totalPrice = selectedProduct
    ? selectedProduct.price * quantityNumber
    : 0;

  function resetForm() {
    setSelectedProductId('');
    setQuantity('');
  }

  async function handleSell(e) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    // ตรวจสอบข้อมูลเบื้องต้น
    if (!selectedProductId) {
      setErrorMsg('กรุณาเลือกสินค้า');
      return;
    }
    if (!quantity || quantityNumber <= 0) {
      setErrorMsg('กรุณากรอกจำนวนที่ถูกต้อง');
      return;
    }

    setSelling(true);

    // ดึงข้อมูล stock ล่าสุดของสินค้าตัวนี้อีกครั้ง เพื่อความชัวร์ว่า stock ไม่เปลี่ยนไปจากที่แสดงบนหน้าจอ
    const { data: latestProduct, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', selectedProductId)
      .single();

    if (fetchError || !latestProduct) {
      setErrorMsg('ไม่พบข้อมูลสินค้า กรุณาลองใหม่');
      setSelling(false);
      return;
    }

    // ตรวจสอบว่า stock เพียงพอหรือไม่
    if (latestProduct.stock < quantityNumber) {
      setErrorMsg(
        `สินค้าคงเหลือไม่พอ (คงเหลือ ${latestProduct.stock} ${latestProduct.unit})`
      );
      setSelling(false);
      return;
    }

    const total = latestProduct.price * quantityNumber;

    // บันทึกรายการขายลงตาราง sales
    const { error: saleError } = await supabase.from('sales').insert([
      {
        product_id: latestProduct.id,
        product_name: latestProduct.name,
        quantity: quantityNumber,
        total_price: total,
        sold_at: new Date().toISOString(),
      },
    ]);

    if (saleError) {
      setErrorMsg('บันทึกการขายไม่สำเร็จ: ' + saleError.message);
      setSelling(false);
      return;
    }

    // อัปเดต stock ในตาราง products ให้ลดลงตามจำนวนที่ขาย
    const newStock = latestProduct.stock - quantityNumber;
    const { error: updateError } = await supabase
      .from('products')
      .update({ stock: newStock })
      .eq('id', latestProduct.id);

    if (updateError) {
      setErrorMsg('อัปเดตสต็อกไม่สำเร็จ: ' + updateError.message);
      setSelling(false);
      return;
    }

    // สำเร็จ: แจ้งเตือนและรีเซ็ตฟอร์ม
    setSuccessMsg(
      `ขาย ${latestProduct.name} จำนวน ${quantityNumber} ${latestProduct.unit} สำเร็จ (รวม ${total.toFixed(2)} บาท)`
    );
    resetForm();
    fetchProducts(); // โหลดสินค้าใหม่เพื่ออัปเดต stock ที่แสดงผล
    setSelling(false);
  }

  return (
    <div>
      <h1>ขายสินค้า</h1>

      {errorMsg && <p className="error-text">{errorMsg}</p>}
      {successMsg && <p className="success-text">{successMsg}</p>}

      <div className="card">
        {loading ? (
          <p>กำลังโหลดข้อมูลสินค้า...</p>
        ) : (
          <form onSubmit={handleSell}>
            <div className="form-row">
              {/* Dropdown เลือกสินค้า */}
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

              {/* ช่องกรอกจำนวน */}
              <input
                type="number"
                placeholder="จำนวน"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            {/* แสดงยอดรวมอัตโนมัติ */}
            <div className="form-row">
              <p>
                <strong>ยอดรวม: {totalPrice.toFixed(2)} บาท</strong>
              </p>
            </div>

            <button type="submit" disabled={selling}>
              {selling ? 'กำลังบันทึก...' : 'ขาย'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
