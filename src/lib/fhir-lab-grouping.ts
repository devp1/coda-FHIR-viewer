/**
 * Display-only lab grouping for raw FHIR Observations.
 *
 * The source taxonomy is Roger's Lab reference catalog:
 *   Lab/data/lab-reference-ranges/2026-06-10/lab_reference_ranges_260610.xlsx
 * The source SHA-256 below pins that workbook; its generated JSON projection has SHA-256
 * ea4d5f438b45046fb183414b1377e80ea691e1d153836223316869338a791aa5.
 *
 * This viewer stays standalone and single-file, so the needed category/family/source-row identities live
 * here as TypeScript constants instead of importing Lab code or shipping JSON. The mapping below is only a
 * readability layer: row labels, values, units, and cells remain verbatim from FHIR.
 */

export const LAB_REFERENCE_SOURCE_DATE = '2026-06-10';
export const LAB_REFERENCE_SOURCE_SHA256 = 'e65a7b63f2662100e5850f370b11af818d12afb07ed562cac32c551c86969a4d';

export type FhirLabGroup = {
  categoryId: string;
  categoryLabel: string;
  familyId: string;
  familyLabel: string;
  entryLabel: string;
  /** Roger catalog source_row. Also the within-catalog display order. */
  sourceRow: number;
  /** The match path is deliberately surfaced for tests and future audit receipts. */
  match: 'loinc' | 'display';
};

export type FhirLabReferenceEntry = Omit<FhirLabGroup, 'match'>;

export const FHIR_LAB_REFERENCE_ENTRIES: FhirLabReferenceEntry[] = [
  { sourceRow: 2, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'White Blood Cells' },
  { sourceRow: 3, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'Red Blood Cells' },
  { sourceRow: 4, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'Hemoglobin' },
  { sourceRow: 5, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'Hematocrit' },
  { sourceRow: 6, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'Mean Corpuscular Volume' },
  { sourceRow: 7, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'Mean Corpuscular Hemoglobin' },
  { sourceRow: 8, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'Mean Corpuscular Hemoglobin Concentration' },
  { sourceRow: 9, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'Platelets' },
  { sourceRow: 10, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'Mean Platelet Volume' },
  { sourceRow: 11, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'complete-blood-count-cbc', familyLabel: 'Complete Blood Count (CBC)', entryLabel: 'Red Cell Distribution Width' },
  { sourceRow: 12, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Nucleated RBC %' },
  { sourceRow: 13, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Neutrophils %' },
  { sourceRow: 14, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Lymphocytes %' },
  { sourceRow: 15, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Monocytes %' },
  { sourceRow: 16, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Eosinophils %' },
  { sourceRow: 17, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Basophils %' },
  { sourceRow: 18, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Plasma Cells %' },
  { sourceRow: 19, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Granulocytes, immature %' },
  { sourceRow: 20, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Bands %' },
  { sourceRow: 22, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Nucleated RBC #' },
  { sourceRow: 23, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Neutrophils #' },
  { sourceRow: 24, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Lymph #' },
  { sourceRow: 25, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Mono #' },
  { sourceRow: 26, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Eos #' },
  { sourceRow: 27, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Baso #' },
  { sourceRow: 28, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Plasma Cells #' },
  { sourceRow: 29, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Granulocytes, immature #' },
  { sourceRow: 30, categoryId: 'hematology', categoryLabel: 'Hematology', familyId: 'blood-differential', familyLabel: 'Blood Differential', entryLabel: 'Absolute Neutrophil Count' },
  { sourceRow: 31, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Sodium' },
  { sourceRow: 32, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Potassium' },
  { sourceRow: 33, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Chloride' },
  { sourceRow: 34, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Bicarbonate' },
  { sourceRow: 35, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Blood Urea Nitrogen' },
  { sourceRow: 36, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Creatinine' },
  { sourceRow: 37, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Glucose' },
  { sourceRow: 38, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Calcium' },
  { sourceRow: 39, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Estimated Glomerular Filtration Rate (Creatinine)' },
  { sourceRow: 40, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'basic-metabolic-panel-bmp', familyLabel: 'Basic Metabolic Panel (BMP)', entryLabel: 'Anion Gap' },
  { sourceRow: 41, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'hepatic-panel-lft', familyLabel: 'Hepatic Panel (LFT)', entryLabel: 'Aspartate Aminotransferase' },
  { sourceRow: 42, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'hepatic-panel-lft', familyLabel: 'Hepatic Panel (LFT)', entryLabel: 'Alanine Aminotransferase' },
  { sourceRow: 43, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'hepatic-panel-lft', familyLabel: 'Hepatic Panel (LFT)', entryLabel: 'Alkaline Phosphatase' },
  { sourceRow: 44, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'hepatic-panel-lft', familyLabel: 'Hepatic Panel (LFT)', entryLabel: 'Bilirubin, Total' },
  { sourceRow: 45, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'hepatic-panel-lft', familyLabel: 'Hepatic Panel (LFT)', entryLabel: 'Bilirubin, Direct' },
  { sourceRow: 46, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'hepatic-panel-lft', familyLabel: 'Hepatic Panel (LFT)', entryLabel: 'Albumin' },
  { sourceRow: 47, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'hepatic-panel-lft', familyLabel: 'Hepatic Panel (LFT)', entryLabel: 'Total Protein' },
  { sourceRow: 48, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'magnesium', familyLabel: 'Magnesium', entryLabel: 'Mg' },
  { sourceRow: 49, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'phosphorus', familyLabel: 'Phosphorus', entryLabel: 'Phos' },
  { sourceRow: 51, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'cystatin-c', familyLabel: 'Cystatin C', entryLabel: 'Cystatin C' },
  { sourceRow: 52, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'cystatin-c', familyLabel: 'Cystatin C', entryLabel: 'Estimated Glomerular Filtration Rate (Cystatin C)' },
  { sourceRow: 53, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'lactic-acid-lactate', familyLabel: 'Lactic acid / Lactate', entryLabel: 'Lactic acid / Lactate' },
  { sourceRow: 57, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'serum-osmolality', familyLabel: 'Serum Osmolality', entryLabel: 'Osm' },
  { sourceRow: 58, categoryId: 'chemistries', categoryLabel: 'Chemistries', familyId: 'lipase', familyLabel: 'Lipase', entryLabel: 'Lipase' },
  { sourceRow: 79, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'lipid-panel', familyLabel: 'Lipid Panel', entryLabel: 'Total Cholesterol' },
  { sourceRow: 80, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'lipid-panel', familyLabel: 'Lipid Panel', entryLabel: 'High Density Lipoprotein' },
  { sourceRow: 81, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'lipid-panel', familyLabel: 'Lipid Panel', entryLabel: 'Triglycerides' },
  { sourceRow: 82, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'lipid-panel', familyLabel: 'Lipid Panel', entryLabel: 'Low Density Lipoprotein' },
  { sourceRow: 83, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'lipid-panel', familyLabel: 'Lipid Panel', entryLabel: 'Non-HDL Cholesterol' },
  { sourceRow: 86, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'troponin-t-hs-gen5', familyLabel: 'Troponin-T HS Gen5', entryLabel: 'hsTnT' },
  { sourceRow: 87, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'troponin-i-hs-abbott', familyLabel: 'Troponin-I HS (Abbott)', entryLabel: 'hsTnI' },
  { sourceRow: 88, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'n-terminal-pro-b-type-natriuretic-peptide', familyLabel: 'N-terminal Pro-B-Type Natriuretic Peptide', entryLabel: 'NT-proBNP' },
  { sourceRow: 89, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'b-type-natriuretic-peptide', familyLabel: 'B-Type Natriuretic Peptide', entryLabel: 'BNP' },
  { sourceRow: 90, categoryId: 'cardiac-tests', categoryLabel: 'Cardiac Tests', familyId: 'c-reactive-protein-high-sensitivity', familyLabel: 'C Reactive Protein (high sensitivity)', entryLabel: 'hsCRP' },
  { sourceRow: 91, categoryId: 'endocrine-tests', categoryLabel: 'Endocrine Tests', familyId: 'hemoglobin-a1c', familyLabel: 'Hemoglobin A1c', entryLabel: 'HbA1c' },
  { sourceRow: 92, categoryId: 'endocrine-tests', categoryLabel: 'Endocrine Tests', familyId: 'thyroid-function-test-with-reflex', familyLabel: 'Thyroid Function Test with Reflex', entryLabel: 'Thyroid Stimulating Hormone' },
  { sourceRow: 93, categoryId: 'endocrine-tests', categoryLabel: 'Endocrine Tests', familyId: 'thyroid-function-test-with-reflex', familyLabel: 'Thyroid Function Test with Reflex', entryLabel: 'Free Thyroxine' },
  { sourceRow: 98, categoryId: 'endocrine-tests', categoryLabel: 'Endocrine Tests', familyId: 'parathyroid-hormone', familyLabel: 'Parathyroid Hormone', entryLabel: 'PTH' },
  { sourceRow: 100, categoryId: 'coagulation-tests', categoryLabel: 'Coagulation Tests', familyId: 'prothrombin-time', familyLabel: 'Prothrombin Time', entryLabel: 'Prothrombin Time-International Normalized Ratio' },
  { sourceRow: 101, categoryId: 'coagulation-tests', categoryLabel: 'Coagulation Tests', familyId: 'activated-partial-thromboplastin-time', familyLabel: 'Activated Partial Thromboplastin Time', entryLabel: 'PTT' },
  { sourceRow: 102, categoryId: 'coagulation-tests', categoryLabel: 'Coagulation Tests', familyId: 'fibrinogen', familyLabel: 'Fibrinogen', entryLabel: 'Fibrinogen' },
  { sourceRow: 117, categoryId: 'immunology', categoryLabel: 'Immunology', familyId: 'erythrocyte-sedimentation-rate', familyLabel: 'Erythrocyte Sedimentation Rate', entryLabel: 'ESR' },
  { sourceRow: 118, categoryId: 'immunology', categoryLabel: 'Immunology', familyId: 'c-reactive-protein', familyLabel: 'C Reactive Protein', entryLabel: 'CRP' },
  { sourceRow: 126, categoryId: 'immunology', categoryLabel: 'Immunology', familyId: 'serum-free-light-chain', familyLabel: 'Serum Free Light Chain', entryLabel: 'Kappa Free Light Chain' },
  { sourceRow: 127, categoryId: 'immunology', categoryLabel: 'Immunology', familyId: 'serum-free-light-chain', familyLabel: 'Serum Free Light Chain', entryLabel: 'Lambda Free Light Chain' },
  { sourceRow: 128, categoryId: 'immunology', categoryLabel: 'Immunology', familyId: 'serum-free-light-chain', familyLabel: 'Serum Free Light Chain', entryLabel: 'Free Kappa/Lambda Ratio' },
  { sourceRow: 177, categoryId: 'anemia-studies', categoryLabel: 'Anemia Studies', familyId: 'iron-studies', familyLabel: 'Iron Studies', entryLabel: 'Ferritin' },
  { sourceRow: 178, categoryId: 'anemia-studies', categoryLabel: 'Anemia Studies', familyId: 'iron-studies', familyLabel: 'Iron Studies', entryLabel: 'Iron' },
  { sourceRow: 179, categoryId: 'anemia-studies', categoryLabel: 'Anemia Studies', familyId: 'iron-studies', familyLabel: 'Iron Studies', entryLabel: 'Total Iron-Binding Capacity' },
  { sourceRow: 180, categoryId: 'anemia-studies', categoryLabel: 'Anemia Studies', familyId: 'iron-studies', familyLabel: 'Iron Studies', entryLabel: 'Transferrin Saturation' },
  { sourceRow: 181, categoryId: 'anemia-studies', categoryLabel: 'Anemia Studies', familyId: 'vitamin-b12', familyLabel: 'Vitamin B12', entryLabel: 'Vitamin B12' },
  { sourceRow: 200, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Color' },
  { sourceRow: 201, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Clarity' },
  { sourceRow: 202, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Specific Gravity' },
  { sourceRow: 203, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'pH' },
  { sourceRow: 204, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Protein' },
  { sourceRow: 205, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Glucose' },
  { sourceRow: 206, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Ketones' },
  { sourceRow: 207, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Blood' },
  { sourceRow: 208, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Leukocyte Esterase' },
  { sourceRow: 209, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Nitrite' },
  { sourceRow: 210, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Bilirubin' },
  { sourceRow: 211, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Urobilinogen' },
  { sourceRow: 212, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'White Blood Cells' },
  { sourceRow: 213, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Red Blood Cells' },
  { sourceRow: 214, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Squamous Epithelial Cells' },
  { sourceRow: 215, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Mucus' },
  { sourceRow: 216, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Bacteria' },
  { sourceRow: 217, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Hyaline Casts' },
  { sourceRow: 218, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Granular Casts' },
  { sourceRow: 219, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Calcium Oxalate Crystals' },
  { sourceRow: 220, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urinalysis-with-sediment', familyLabel: 'Urinalysis with Sediment', entryLabel: 'Yeast' },
  { sourceRow: 221, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-chemistries', familyLabel: 'Urine Chemistries', entryLabel: 'Chloride, random urine' },
  { sourceRow: 222, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-chemistries', familyLabel: 'Urine Chemistries', entryLabel: 'Sodium, random urine' },
  { sourceRow: 224, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-chemistries', familyLabel: 'Urine Chemistries', entryLabel: 'Osmolality, random urine' },
  { sourceRow: 225, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-albumin-to-creatinine-ratio-uacr', familyLabel: 'Urine Albumin to Creatinine Ratio (UACR)', entryLabel: 'Microalbumin, random urine' },
  { sourceRow: 226, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-albumin-to-creatinine-ratio-uacr', familyLabel: 'Urine Albumin to Creatinine Ratio (UACR)', entryLabel: 'Creatinine, random urine' },
  { sourceRow: 227, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-albumin-to-creatinine-ratio-uacr', familyLabel: 'Urine Albumin to Creatinine Ratio (UACR)', entryLabel: 'Microalbumin/Creatinine Ratio' },
  { sourceRow: 228, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-protein-to-creatinine-ratio-upcr', familyLabel: 'Urine Protein to Creatinine Ratio (UPCR)', entryLabel: 'Protein, random urine' },
  { sourceRow: 229, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-protein-to-creatinine-ratio-upcr', familyLabel: 'Urine Protein to Creatinine Ratio (UPCR)', entryLabel: 'Creatinine, random urine' },
  { sourceRow: 230, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-protein-to-creatinine-ratio-upcr', familyLabel: 'Urine Protein to Creatinine Ratio (UPCR)', entryLabel: 'Protein/Creatinine Ratio' },
  { sourceRow: 231, categoryId: 'urine-studies', categoryLabel: 'Urine Studies', familyId: 'urine-protein-electrophoresis-bence-jones', familyLabel: 'Urine Protein Electrophoresis (Bence Jones)', entryLabel: 'UPEP' },
];

const ENTRY_BY_SOURCE_ROW = new Map(FHIR_LAB_REFERENCE_ENTRIES.map(entry => [entry.sourceRow, entry]));

const LOINC_TO_SOURCE_ROW: Record<string, number> = {
  '6690-2': 2,
  '789-8': 3,
  '718-7': 4,
  '4544-3': 5,
  '787-2': 6,
  '785-6': 7,
  '786-4': 8,
  '777-3': 9,
  '32623-1': 10,
  '788-0': 11,
  '58413-6': 12,
  '770-8': 13,
  '736-9': 14,
  '5905-5': 15,
  '714-6': 16,
  '706-2': 17,
  '13047-6': 18,
  '51584-1': 29,
  '764-1': 20,
  '19048-8': 22,
  '751-8': 23,
  '731-0': 24,
  '742-7': 25,
  '713-8': 26,
  '704-7': 27,
  '2951-2': 31,
  '2823-3': 32,
  '2075-0': 33,
  '2028-9': 34,
  '3094-0': 35,
  '2160-0': 36,
  '2345-7': 37,
  '17861-6': 38,
  '33914-3': 39,
  '33037-3': 40,
  '1920-8': 41,
  '1742-6': 42,
  '6768-6': 43,
  '1975-2': 44,
  '1968-7': 45,
  '1751-7': 46,
  '2885-2': 47,
  '2601-3': 48,
  '2777-1': 49,
  '33863-2': 51,
  '50210-4': 52,
  '2524-7': 53,
  '2692-2': 57,
  '3040-3': 58,
  '2093-3': 79,
  '2085-9': 80,
  '2571-8': 81,
  '13457-7': 82,
  '2089-1': 82,
  '43396-1': 83,
  '67151-1': 86,
  '89579-7': 87,
  '33762-6': 88,
  '30934-4': 89,
  '30522-7': 90,
  '4548-4': 91,
  '3016-3': 92,
  '3024-7': 93,
  '2731-8': 98,
  '6301-6': 100,
  '14979-9': 101,
  '3255-7': 102,
  '4537-7': 117,
  '1988-5': 118,
  '36916-5': 126,
  '33944-0': 127,
  '48378-4': 128,
  '2276-4': 177,
  '2498-4': 178,
  '2500-7': 179,
  '2502-3': 180,
  '2132-9': 181,
  '5778-6': 200,
  '5767-9': 201,
  '72290-0': 201,
  '2965-2': 202,
  '33513-3': 202,
  '5803-2': 203,
  '106930-1': 203,
  '20454-5': 204,
  '5792-7': 205,
  '5797-6': 206,
  '18235-2': 206,
  '5794-3': 207,
  '18684-1': 207,
  '5799-2': 208,
  '105093-9': 212,
  '5802-4': 209,
  '96293-6': 209,
  '78442-1': 210,
  '13658-0': 211,
  '5821-4': 212,
  '13945-1': 213,
  '99860-9': 213,
  '63487-3': 214,
  '88979-0': 215,
  '95598-9': 215,
  '25145-4': 216,
  '73669-4': 216,
  '105101-0': 217,
  '44382-0': 217,
  '107172-9': 218,
  '111453-7': 221,
  '2955-3': 222,
  '2695-5': 224,
  '108029-0': 225,
  '78768-9': 226,
  '42483-8': 228,
};

const DISPLAY_ALIASES: Array<[string, number]> = [
  ['Imm. Granulocyte, Abs', 29],
  ['Imm. Granulocyte, %', 19],
  ['Segmented Neutrophils', 13],
  ["Alk P'TASE, Total, Ser/Plas", 43],
  ['Protein, Total, Ser/Plas', 47],
  ['Conjugated Bili', 45],
  ['Protein, Total, Urine', 228],
  ['Creatinine, Urine', 226],
  ['Creatinine, urine', 226],
  ['Albumin, Urine', 225],
  ['Albumin Urine (Manual Entry) See EMR for details', 225],
  ['Mucous Threads, urine', 215],
  ['Mucus Threads', 215],
  ['Ketone, urine', 206],
  ['Ketones', 206],
  ['WBC, urine', 212],
  ['RBC, urine', 213],
  ['Hyaline Cast', 217],
];

const DISPLAY_TO_SOURCE_ROW = new Map(DISPLAY_ALIASES.map(([label, sourceRow]) => [normalizeDisplayLabel(label), sourceRow]));

function normalizeDisplayLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9%#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loincFromCodeKey(codeKey: string): string | null {
  const sep = codeKey.indexOf('|');
  if (sep < 0) return null;
  const system = codeKey.slice(0, sep).toLowerCase();
  const code = codeKey.slice(sep + 1);
  return system === 'http://loinc.org' && code ? code : null;
}

function groupForSourceRow(sourceRow: number, match: FhirLabGroup['match']): FhirLabGroup | null {
  const entry = ENTRY_BY_SOURCE_ROW.get(sourceRow);
  return entry ? { ...entry, match } : null;
}

export function resolveFhirLabGroup(codeKey: string, label: string): FhirLabGroup | null {
  const loinc = loincFromCodeKey(codeKey);
  if (loinc) {
    const sourceRow = LOINC_TO_SOURCE_ROW[loinc];
    const group = sourceRow ? groupForSourceRow(sourceRow, 'loinc') : null;
    if (group) return group;
  }

  const displaySourceRow = DISPLAY_TO_SOURCE_ROW.get(normalizeDisplayLabel(label));
  return displaySourceRow ? groupForSourceRow(displaySourceRow, 'display') : null;
}

export function compareFhirLabRows(
  a: { label: string; labGroup?: FhirLabGroup | null },
  b: { label: string; labGroup?: FhirLabGroup | null },
): number {
  const ag = a.labGroup ?? null;
  const bg = b.labGroup ?? null;
  if (ag && bg) return ag.sourceRow - bg.sourceRow || a.label.localeCompare(b.label);
  if (ag) return -1;
  if (bg) return 1;
  return a.label.localeCompare(b.label);
}
