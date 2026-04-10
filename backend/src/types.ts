export type TemplateInput = {
  name: string;
  slug: string;
  description?: string;
  category?: string;
  scoringLabels: string[];
  domains: Array<{
    title: string;
    description?: string;
    questions: Array<{
      prompt: string;
      guidance?: string;
      levels: Array<{
        value: number;
        label: string;
        description: string;
      }>;
    }>;
  }>;
};
