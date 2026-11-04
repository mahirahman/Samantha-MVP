CREATE TABLE public.patients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  medical_record_number text UNIQUE,
  full_name text NOT NULL,
  date_of_birth date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT patients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.doctors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text UNIQUE,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT doctors_pkey PRIMARY KEY (id)
);
CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  status text NOT NULL DEFAULT 'uploaded'::text CHECK (status = ANY (ARRAY['uploaded'::text, 'processing'::text, 'needs_review'::text, 'ready_to_file'::text, 'filed'::text, 'failed'::text, 'deleted'::text])),
  document_category text,
  ocr_text text,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT documents_pkey PRIMARY KEY (id),
  CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE TABLE public.document_extractions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE,
  patient_id uuid,
  doctor_id uuid,
  date_of_report date,
  subject text,
  source_contact text,
  inbox_type text CHECK (inbox_type = ANY (ARRAY['Doctor''s Inbox'::text, 'Patient''s File'::text])),
  store_in text CHECK (store_in = ANY (ARRAY['Correspondence'::text, 'Investigations'::text])),
  category text,
  confidence jsonb DEFAULT '{}'::jsonb,
  needs_review boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT document_extractions_pkey PRIMARY KEY (id),
  CONSTRAINT document_extractions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT document_extractions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT document_extractions_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id)
);
CREATE TABLE public.filings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE,
  patient_id uuid NOT NULL,
  doctor_id uuid,
  date_of_report date NOT NULL,
  subject text NOT NULL,
  source_contact text,
  inbox_type text NOT NULL,
  store_in text NOT NULL,
  category text NOT NULL,
  approved_by uuid,
  approved_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'filed'::text,
  CONSTRAINT filings_pkey PRIMARY KEY (id),
  CONSTRAINT filings_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT filings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patients(id),
  CONSTRAINT filings_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.doctors(id),
  CONSTRAINT filings_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES auth.users(id)
);
CREATE TABLE public.audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid,
  actor_id uuid,
  action text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT audit_logs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id)
);
CREATE TABLE public.import_preferences (
  user_id uuid NOT NULL,
  folder_name text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT import_preferences_pkey PRIMARY KEY (user_id),
  CONSTRAINT import_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);