-- First, we need to add the new values to the order_status enum
-- Drop the default constraint first
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;

-- Create a new enum type with all the values
CREATE TYPE order_status_new AS ENUM (
  'مسودة',
  'قيد الانتظار',
  'ملغي',
  'مؤكد',
  'تم التغليف جاهز للتوصيل',
  'قيد التوصيل',
  'تم التوصيل',
  'عائد',
  'مكتمل'
);

-- Update the column to use the new enum type
ALTER TABLE orders 
  ALTER COLUMN status TYPE order_status_new 
  USING status::text::order_status_new;

-- Drop the old enum type
DROP TYPE order_status;

-- Rename the new enum type to the original name
ALTER TYPE order_status_new RENAME TO order_status;

-- Re-add the default constraint
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'مسودة'::order_status;