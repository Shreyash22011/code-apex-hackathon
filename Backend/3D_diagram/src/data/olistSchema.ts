import type { TableNode, ForeignKeyLink } from '@/store/useAppStore';

export const tables: TableNode[] = [
  {
    id: 'olist_customers',
    name: 'olist_customers',
    rows: 99441,
    columns: ['customer_id', 'customer_unique_id', 'customer_zip_code_prefix', 'customer_city', 'customer_state'],
    qualityScore: 95,
    isQueried: false,
    group: 'customer',
  },
  {
    id: 'olist_orders',
    name: 'olist_orders',
    rows: 99441,
    columns: ['order_id', 'customer_id', 'order_status', 'order_purchase_timestamp', 'order_approved_at', 'order_delivered_carrier_date', 'order_delivered_customer_date', 'order_estimated_delivery_date'],
    qualityScore: 88,
    isQueried: false,
    group: 'order',
  },
  {
    id: 'olist_order_items',
    name: 'olist_order_items',
    rows: 112650,
    columns: ['order_id', 'order_item_id', 'product_id', 'seller_id', 'shipping_limit_date', 'price', 'freight_value'],
    qualityScore: 92,
    isQueried: false,
    group: 'order',
  },
  {
    id: 'olist_products',
    name: 'olist_products',
    rows: 32951,
    columns: ['product_id', 'product_category_name', 'product_name_length', 'product_description_length', 'product_photos_qty', 'product_weight_g', 'product_length_cm', 'product_height_cm', 'product_width_cm'],
    qualityScore: 72,
    isQueried: false,
    group: 'product',
  },
  {
    id: 'olist_sellers',
    name: 'olist_sellers',
    rows: 3095,
    columns: ['seller_id', 'seller_zip_code_prefix', 'seller_city', 'seller_state'],
    qualityScore: 97,
    isQueried: false,
    group: 'seller',
  },
  {
    id: 'olist_order_payments',
    name: 'olist_order_payments',
    rows: 103886,
    columns: ['order_id', 'payment_sequential', 'payment_type', 'payment_installments', 'payment_value'],
    qualityScore: 85,
    isQueried: false,
    group: 'order',
  },
  {
    id: 'olist_order_reviews',
    name: 'olist_order_reviews',
    rows: 100000,
    columns: ['review_id', 'order_id', 'review_score', 'review_comment_title', 'review_comment_message', 'review_creation_date', 'review_answer_timestamp'],
    qualityScore: 58,
    isQueried: false,
    group: 'review',
  },
  {
    id: 'olist_geolocation',
    name: 'olist_geolocation',
    rows: 1000163,
    columns: ['geolocation_zip_code_prefix', 'geolocation_lat', 'geolocation_lng', 'geolocation_city', 'geolocation_state'],
    qualityScore: 80,
    isQueried: false,
    group: 'geo',
  },
  {
    id: 'product_category_name_translation',
    name: 'product_category_name_translation',
    rows: 71,
    columns: ['product_category_name', 'product_category_name_english'],
    qualityScore: 100,
    isQueried: false,
    group: 'product',
  },
];

export const foreignKeys: ForeignKeyLink[] = [
  { source: 'olist_orders', target: 'olist_customers', sourceCol: 'customer_id', targetCol: 'customer_id' },
  { source: 'olist_order_items', target: 'olist_orders', sourceCol: 'order_id', targetCol: 'order_id' },
  { source: 'olist_order_items', target: 'olist_products', sourceCol: 'product_id', targetCol: 'product_id' },
  { source: 'olist_order_items', target: 'olist_sellers', sourceCol: 'seller_id', targetCol: 'seller_id' },
  { source: 'olist_order_payments', target: 'olist_orders', sourceCol: 'order_id', targetCol: 'order_id' },
  { source: 'olist_order_reviews', target: 'olist_orders', sourceCol: 'order_id', targetCol: 'order_id' },
  { source: 'olist_products', target: 'product_category_name_translation', sourceCol: 'product_category_name', targetCol: 'product_category_name' },
  // Inferred / hidden FK
  { source: 'olist_customers', target: 'olist_geolocation', sourceCol: 'customer_zip_code_prefix', targetCol: 'geolocation_zip_code_prefix' },
  { source: 'olist_sellers', target: 'olist_geolocation', sourceCol: 'seller_zip_code_prefix', targetCol: 'geolocation_zip_code_prefix' },
];

export const getGraphData = () => {
  const nodes = tables.map((t) => ({
    id: t.id,
    name: t.name,
    val: Math.max(Math.log10(t.rows) * 3, 4),
    rows: t.rows,
    columns: t.columns,
    qualityScore: t.qualityScore,
    group: t.group,
  }));

  const links = foreignKeys.map((fk) => ({
    source: fk.source,
    target: fk.target,
    sourceCol: fk.sourceCol,
    targetCol: fk.targetCol,
  }));

  return { nodes, links };
};
