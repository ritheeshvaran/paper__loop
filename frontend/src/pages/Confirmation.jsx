import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useCart } from "@/context/CartContext";

const Confirmation = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const { refresh } = useCart();
  useEffect(() => { api.get(`/orders/${id}`).then((r) => setOrder(r.data)); refresh(); }, [id, refresh]);

  if (!order) return <div className="min-h-[60vh] flex items-center justify-center">Loading…</div>;

  return (
    <div className="pl-section-light py-16">
      <div className="pl-container max-w-2xl text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 10, stiffness: 200 }}
          className="w-20 h-20 mx-auto rounded-full bg-[color:var(--pl-orange)] flex items-center justify-center">
          <motion.svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
            <motion.path d="M5 12l5 5L20 7" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6, delay: 0.2 }} />
          </motion.svg>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <div className="text-[11px] uppercase tracking-widest text-neutral-500 mt-6">Step 3 of 3 · Confirmation</div>
          <h1 className="font-display uppercase text-editorial mt-2">Payment submitted.</h1>
          <p className="text-neutral-600 mt-3 max-w-md mx-auto" data-testid="confirmation-status">
            Payment submitted successfully. Waiting for verification.
          </p>

          <div className="mt-8 border border-neutral-200 p-6 text-left">
            <div className="flex justify-between items-center mb-4">
              <div className="text-[11px] uppercase tracking-widest text-neutral-500">Order Number</div>
              <div className="font-mono">{order.order_number}</div>
            </div>
            <div className="flex justify-between items-baseline">
              <div className="text-[11px] uppercase tracking-widest text-neutral-500">Total Paid</div>
              <div className="font-display text-2xl font-bold font-tabular">{formatINR(order.total)}</div>
            </div>
            {order.transaction_id && (
              <div className="mt-3 pt-3 border-t border-neutral-100 flex justify-between text-xs">
                <span className="uppercase tracking-widest text-neutral-500">Transaction ID</span>
                <span className="font-mono">{order.transaction_id}</span>
              </div>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <Link to={`/account/orders/${order.id}`} className="pl-btn pl-btn-dark" data-testid="view-order-btn">View Order</Link>
            <Link to="/shop" className="pl-btn pl-btn-ghost-light">Continue Shopping</Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
export default Confirmation;
