content = open('supabase/migrations/20260422000007_1_icd10_data.sql', encoding='utf-8').read()
lines = content.split('\n')
for i, line in enumerate(lines):
    if "'D'" in line or "'D'," in line:
        print(f'Line {i}: {line[:120]}')