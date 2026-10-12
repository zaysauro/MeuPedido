-- MeuPedido: transicoes atomicas e auditaveis de entrega.
-- Aplicar depois de 020.
BEGIN;
CREATE OR REPLACE FUNCTION restaurant_update_delivery(
 p_org uuid,p_user text,p_order uuid,p_next text,p_driver text,p_phone text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_channel text;v_status text;v_current text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=p_org AND user_id=p_user)
 THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT channel,status INTO v_channel,v_status FROM restaurant_orders
 WHERE id=p_order AND organization_id=p_org FOR UPDATE;
 IF NOT FOUND OR v_channel<>'delivery' OR v_status='cancelado' THEN RAISE EXCEPTION 'invalid_delivery_order'; END IF;
 INSERT INTO restaurant_delivery_tracking(organization_id,order_id)
 VALUES(p_org,p_order) ON CONFLICT DO NOTHING;
 SELECT status INTO v_current FROM restaurant_delivery_tracking
 WHERE organization_id=p_org AND order_id=p_order FOR UPDATE;
 IF NOT ((v_current='aguardando' AND p_next='despachado' AND v_status IN ('pronto','entregue'))
 OR (v_current='despachado' AND p_next IN ('em_rota','falhou'))
 OR (v_current='em_rota' AND p_next IN ('entregue','falhou'))
 OR (v_current='falhou' AND p_next='despachado'))
 THEN RAISE EXCEPTION 'invalid_delivery_transition'; END IF;
 UPDATE restaurant_delivery_tracking SET status=p_next,
 driver_name=left(coalesce(p_driver,driver_name,''),120),
 driver_phone=left(coalesce(p_phone,driver_phone,''),40),
 dispatched_at=CASE WHEN p_next='despachado' THEN now() ELSE dispatched_at END,
 delivered_at=CASE WHEN p_next='entregue' THEN now() ELSE NULL END,
 updated_at=now()
 WHERE organization_id=p_org AND order_id=p_order;
 RETURN p_next;
END $$;
COMMIT;
