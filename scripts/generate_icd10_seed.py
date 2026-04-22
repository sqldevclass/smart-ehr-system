import openpyxl
import uuid
import os

def clean_parent(val):
    if val is None:
        return None
    val = str(val).strip()
    if val in ('', '-', 'None'):
        return None
    return val

# Update this path to where your file is
EXCEL_PATH = r"C:\Users\bunyo\Downloads\ICD-10_csv.xlsx"
OUTPUT_PATH = r"supabase\migrations\20260422000007_icd10_seed.sql"

wb = openpyxl.load_workbook(EXCEL_PATH, read_only=True)
ws = wb.active

rows = []
seen_codes = set()

for row in ws.iter_rows(values_only=True):
    # Skip header row
    if row[0] == 'id':
        continue

    root  = row[1]  # class letter e.g. 'A'
    col2  = row[2]  # level 2 e.g. 'A00-A09'
    col3  = row[3]  # level 3 e.g. 'A00'
    col4  = row[4]  # level 4 e.g. 'A00.0'
    name  = row[6]  # Название

    if not name:
        continue

    # Determine code, level, parent
    if col4 is not None:
        code   = str(col4).strip()
        level  = 4
        parent = code.split('.')[0] if '.' in code else None
        is_leaf = True
    elif col3 is not None:
        code   = str(col3).strip()
        level  = 3
        parent = clean_parent(col2)
        is_leaf = False
    elif col2 is not None:
        code   = str(col2).strip()
        level  = 2
        parent = clean_parent(root)
        is_leaf = False
    elif root is not None and root != '-':
        code   = str(root).strip()
        level  = 1
        parent = None
        is_leaf = False
    else:
        continue

    name_clean = str(name).strip().replace("'", "''")
    if code not in seen_codes:
        seen_codes.add(code)
        # Only keep parent if it exists in seen_codes
        validated_parent = parent if parent in seen_codes else None
        rows.append((code, level, validated_parent, name_clean, is_leaf))
        
# Write SQL file
with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    f.write("-- Migration 007: ICD-10 Seed Data\n")
    f.write("-- 12,879 codes from WHO ICD-10 classification\n")
    f.write("-- Platform-level reference data, read-only via UI\n\n")
    
    f.write("CREATE TABLE public.icd10_codes (\n")
    f.write("  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n")
    f.write("  code        text UNIQUE NOT NULL,\n")
    f.write("  level       int NOT NULL CHECK (level BETWEEN 1 AND 4),\n")
    f.write("  parent_code text REFERENCES public.icd10_codes(code),\n")
    f.write("  name_ru     text NOT NULL,\n")
    f.write("  is_leaf     boolean NOT NULL DEFAULT false\n")
    f.write(");\n\n")
    
    f.write("CREATE INDEX icd10_parent_idx ON public.icd10_codes(parent_code);\n")
    f.write("CREATE INDEX icd10_level_idx ON public.icd10_codes(level);\n")
    f.write("CREATE INDEX icd10_name_search_idx ON public.icd10_codes USING gin(to_tsvector('russian', name_ru));\n\n")

    f.write("-- RLS\n")
    f.write("ALTER TABLE public.icd10_codes ENABLE ROW LEVEL SECURITY;\n")
    f.write("CREATE POLICY \"icd10_select\" ON public.icd10_codes\n")
    f.write("  FOR SELECT TO authenticated USING (true);\n\n")

    f.write("-- Insert all codes (ordered by level so parent FK is satisfied)\n")
    f.write("INSERT INTO public.icd10_codes (code, level, parent_code, name_ru, is_leaf) VALUES\n")
    
    # Sort by level so parents are inserted before children
    rows.sort(key=lambda x: x[1])
    
    lines = []
    for code, level, parent, name, is_leaf in rows:
        parent_val = f"'{parent}'" if parent else "NULL"
        lines.append(
            f"  ('{code}', {level}, {parent_val}, '{name}', {str(is_leaf).lower()})"
        )
    
    f.write(",\n".join(lines))
    f.write(";\n")

print(f"Done. Written {len(rows)} rows to {OUTPUT_PATH}")