import { Frame } from 'playwright';

// ─── Core form field types ───────────────────────────────────────────────────

export interface ParsedFieldOption {
  value: string;
  text: string;
}

export interface ParsedField {
  selector: string;
  elementType: 'input' | 'textarea' | 'select' | 'div';
  inputType?: string;
  isCombobox?: boolean;  // true for <input role="combobox"> — filled via click+listbox, not direct type
  fieldName: string;
  placeholder?: string;
  label?: string;
  questionText?: string;
  autocomplete?: string;
  sectionHeading?: string;  // nearest ancestor region/section heading (e.g. "Profile", "Details")
  required: boolean;
  currentValue?: string;
  options?: ParsedFieldOption[];
  frame?: Frame;
}

export interface FieldMapping {
  field: ParsedField;
  mappedData?: string;
  needsAI: boolean;
  aiPrompt?: string;
}

// ─── Agent result types ───────────────────────────────────────────────────────

export interface FillAttempt {
  mapping: FieldMapping;
  success: boolean;
  error?: string;
}

export interface FillResult {
  successful: FieldMapping[];
  failed: FillAttempt[];
}

export interface FormAnalysis {
  platform: 'workday' | 'greenhouse' | 'lever' | 'workable' | 'smartrecruiters' | 'jobvite' | 'generic';
  isMultiPage: boolean;
}

export interface VerificationResult {
  ready: boolean;
  issues: string[];
}
