-- Initial migration

CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Asset_condition" AS ENUM ('good', 'fair', 'damaged', 'disposed');

CREATE TYPE "Asset_status" AS ENUM ('available', 'assigned', 'under_repair', 'disposed');

CREATE TYPE "Delivery_delivery_status" AS ENUM ('complete', 'partial');

CREATE TYPE "Inspection_result" AS ENUM ('passed', 'failed', 'partial');

CREATE TYPE "Repair_status" AS ENUM ('pending', 'in_progress', 'completed');

CREATE TYPE "Document_document_type" AS ENUM ('RIS', 'PAR', 'ICS', 'AIR');

CREATE TYPE "Document_status" AS ENUM ('pending', 'approved', 'released');

CREATE TYPE "Request_request_type" AS ENUM ('transfer', 'new_supply', 'new_asset');

CREATE TYPE "Request_status" AS ENUM ('pending', 'approved', 'rejected', 'completed');

CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "full_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_number" VARCHAR(255),
    "qr_code" VARCHAR(255),
    "category" VARCHAR(255),
    "description" TEXT,
    "condition" "Asset_condition" DEFAULT 'good',
    "location" VARCHAR(255),
    "assigned_to" UUID,
    "status" "Asset_status" DEFAULT 'available',
    "date_acquired" DATE,
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "po_reference" VARCHAR(255),
    "supplier" VARCHAR(255),
    "date_delivered" DATE,
    "delivery_status" "Delivery_delivery_status" DEFAULT 'complete',
    "received_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inspections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_id" UUID NOT NULL,
    "inspector_id" UUID NOT NULL,
    "inspection_date" DATE NOT NULL,
    "result" "Inspection_result" NOT NULL,
    "remarks" TEXT,
    "air_document_id" UUID,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(255),
    "quantity" INTEGER NOT NULL,
    "unit" VARCHAR(255),
    "reorder_threshold" INTEGER,
    "location" VARCHAR(255),
    "updated_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "repairs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "reported_by" UUID NOT NULL,
    "repair_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "status" "Repair_status" DEFAULT 'pending',
    "cost" NUMERIC(10, 2),
    "technician" VARCHAR(255),
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "repairs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_type" "Document_document_type" NOT NULL,
    "reference_number" VARCHAR(255) NOT NULL,
    "related_asset_id" UUID,
    "related_inventory_id" UUID,
    "status" "Document_status" DEFAULT 'pending',
    "file_url" TEXT,
    "date_created" DATE DEFAULT now(),
    "prepared_by" UUID NOT NULL,
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "request_type" "Request_request_type" NOT NULL,
    "asset_id" UUID,
    "description" TEXT NOT NULL,
    "status" "Request_status" DEFAULT 'pending',
    "date_requested" TIMESTAMPTZ DEFAULT now(),
    "date_resolved" TIMESTAMPTZ,
    CONSTRAINT "requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "action" VARCHAR(255) NOT NULL,
    "module" VARCHAR(255) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "documents_reference_number_key" ON "documents"("reference_number");

CREATE TABLE "idempotency_keys" (
    "key" VARCHAR NOT NULL,
    "operation" VARCHAR NOT NULL,
    "status" VARCHAR NOT NULL DEFAULT 'processing',
    "response" JSONB,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    "updated_at" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "assets_property_number_key" ON "assets"("property_number");
CREATE UNIQUE INDEX "assets_qr_code_key" ON "assets"("qr_code");
CREATE UNIQUE INDEX "documents_reference_number_key" ON "documents"("reference_number");
