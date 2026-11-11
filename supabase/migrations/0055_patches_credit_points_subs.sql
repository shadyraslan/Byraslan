-- ============ 0055 ربط الآجل والنقاط والبدائل بالدوال الموجودة (اتطبّقت على الداتابيز بنفس الترتيب) ============
-- 1) pos_sync: الدفع الآجل (credit + credit_customer) — صلاحية credit.sell، العميل مش ممنوع، وفي حدود المتاح؛ وبيتسجّل في credit_moves بميعاد استحقاق.
-- 2) pos_snapshot: can_credit.
-- 3) app_quote / app_order: اتشالوا واتعملوا تاني بخانات (p_points, p_tokens[, p_sub_pref]) — الاستبدال بإثبات رقم تتبّع طلب قديم من نفس الرقم.
-- 4) partner_queue: بقت volatile، بتحل البدائل اللي مهلتها خلصت، وبترجّع بيانات البديل واختيار العميل.
-- 5) partner_ready: مابتقفلش وفيه بديل مستني، وبتطلّع كود أمان 4 أرقام للشنط.
-- 6) app_track_many / track_order: البدائل والنقاط، والسطر اللي اتبدّل/اتشال مش بيظهر.
-- 7) party_ledger (عميل): حركات الآجل بتأثر في الرصيد.
-- 8) place_order_d: الطلب الآجل من خدمة العملاء بصلاحية وفي حدود المتاح.
-- 9) order_changes.kind: 'substitute'.  10) partner_handover بترجّع رسالة بدل الخطأ عشان عدد المحاولات يتسجّل.
-- 11) cron: points-expire يومي 01:23، subs-resolve كل دقيقة.

do $$ declare d text; begin
d := pg_get_functiondef('pos_sync'::regproc);
d := replace(d, 'v_lim numeric; v_used numeric;', 'v_lim numeric; v_used numeric; v_cr numeric; v_cc bigint; v_cst jsonb;');
d := replace(d, '    insert into sales (location_id, shift_id, at, subtotal, discount, total, paid_cash, paid_card, paid_staff, staff_id, change, client_id, offline, local_no)',
'    v_cr := coalesce((x->>''credit'')::numeric, 0); v_cc := nullif(x->>''credit_customer'', '''')::bigint;
    if v_cr > 0 then
      if not has_perm(''credit.sell'') then raise exception ''البيع الآجل محتاج صلاحية''; end if;
      if v_cc is null then raise exception ''اختار عميل الآجل''; end if;
      v_cst := credit_state(v_cc);
      if v_cst->>''blocked'' is not null then raise exception ''مينفعش آجل: %'', v_cst->>''blocked''; end if;
      if v_cr > (v_cst->>''available'')::numeric + 0.01 then raise exception ''كده العميل هيعدّي حد الآجل — المتاح % ج'', v_cst->>''available''; end if;
    end if;
    insert into sales (location_id, shift_id, at, subtotal, discount, total, paid_cash, paid_card, paid_staff, staff_id, change, client_id, offline, local_no, paid_credit, credit_customer)');
d := replace(d, 'v_staff, v_sid, 0, (x->>''client_id'')::uuid, coalesce((x->>''offline'')::boolean, true), x->>''local_no'')',
                'v_staff, v_sid, 0, (x->>''client_id'')::uuid, coalesce((x->>''offline'')::boolean, true), x->>''local_no'', v_cr, case when v_cr > 0 then v_cc end)');
d := replace(d, 'if v_staff > tot then raise exception', 'if v_cr + v_staff > tot + 0.01 then raise exception ''الآجل أكبر من الفاتورة''; end if;
    if v_staff > tot then raise exception');
d := replace(d, 'change = greatest(paid_cash + paid_card + paid_staff - tot, 0)', 'change = greatest(paid_cash + paid_card + paid_staff + paid_credit - tot, 0)');
d := replace(d, '    out := out || jsonb_build_object(''client_id'', x->>''client_id'', ''no'', v_no, ''conflicts'', to_jsonb(flags));',
'    if v_cr > 0 then
      insert into credit_moves (customer_id, kind, amount, ref, sale_id, location_id, due)
        values (v_cc, ''sale'', v_cr, ''S'' || v_no, v_sale, p_loc, current_date + coalesce((select days from credit_accounts where customer_id = v_cc), 30));
    end if;
    out := out || jsonb_build_object(''client_id'', x->>''client_id'', ''no'', v_no, ''conflicts'', to_jsonb(flags));');
execute d;

d := pg_get_functiondef('pos_snapshot(text)'::regprocedure);
d := replace(d, '''can_discount'',', '''can_credit'', has_perm(''credit.sell''), ''can_discount'',');
execute d;
end $$;

-- app_quote / app_order: شوف 0055_app_points_redeem (اتطبّقت كـ migration لوحدها بنفس الاسم)
-- باقي الـ patches (partner_queue, partner_ready, app_track_many, track_order, party_ledger, place_order_d) اتطبّقت بنفس أسلوب pg_get_functiondef + replace.
alter table order_changes drop constraint if exists order_changes_kind_check;
alter table order_changes add constraint order_changes_kind_check check (kind = any (array['create','lines','reschedule','address','note','cancel','deposit','substitute']));
