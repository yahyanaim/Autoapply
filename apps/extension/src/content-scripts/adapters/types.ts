export interface FormField {
  id: string;
  label: string;
  type: string;
  required: boolean;
}

export interface JobDescription {
  title: string;
  company: string;
  description: string;
  url: string;
}

export interface JobPageAdapter {
  name: string;
  canHandle(url: string): boolean;
  detectJobPosting(): boolean;
  extractJobDescription(): JobDescription | null;
  findFormFields(): FormField[];
  fillField(fieldId: string, value: string): boolean;
}
