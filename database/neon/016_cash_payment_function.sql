-- MeuPedido: registrar pagamento no turno de caixa aberto.
-- Aplicar depois da migracao 015.
BEGIN;
CREATE OR REPLACE FUNCTION restaurant_record_payment(
 p_org uuid,p_user text,p_order uuid,p_method text,p_amount integer
) RETURNS TABLE(order_id uuid,paid_cents bigint,remaining_cents bigint,payment_status text)
LANGUAGE plpgsql AS $$
DECLARE v_order restaurant_orders%ROWTYPE;v_paid bigint;v_session uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user)
 THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF p_method NOT IN ('dinheiro','pix','debito','credito','outro') OR p_amount<=0 THEN RAISE EXCEPTION 'invalid_payment'; END IF;
 SELECT * INTO v_order FROM restaurant_orders WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_order.status='cancelado' THEN RAISE EXCEPTION 'invalid_order'; END IF;
 SELECT COALESCE(SUM(amount_cents),0) INTO v_paid FROM restaurant_payments WHERE organization_id=p_org AND restaurant_payments.order_id=p_order;
 IF v_paid+p_amount>v_order.total_cents THEN RAISE EXCEPTION 'payment_exceeds_balance'; END IF;
 SELECT s.id INTO v_session FROM restaurant_cash_sessions s WHERE s.organization_id=p_org AND s.closed_at IS NULL FOR UPDATE;
 IF p_method='dinheiro' AND v_session IS NULL THEN RAISE EXCEPTION 'cash_session_required'; END IF;
 INSERT INTO restaurant_payments(organization_id,order_id,method,amount_cents,cash_session_id)
 VALUES(p_org,p_order,p_method,p_amount,v_session);
 v_paid:=v_paid+p_amount;
 UPDATE restaurant_orders AS o SET payment_status=CASE WHEN v_paid=o.total_cents THEN 'pago' WHEN v_paid>0 THEN 'parcial' ELSE 'pendente' END,
 closed_at=CASE WHEN v_paid=o.total_cents THEN now() ELSE NULL END,updated_at=now()
 WHERE o.id=p_order AND o.organization_id=p_org;
 RETURN QUERY SELECT p_order,v_paid,v_order.total_cents-v_paid,
 CASE WHEN v_paid=v_order.total_cents THEN 'pago' WHEN v_paid>0 THEN 'parcial' ELSE 'pendente' END;
END $$;
COMMIT;
