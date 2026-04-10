import { prisma } from "../db.js";
import type { TemplateInput } from "../types.js";

async function createVersion(templateId: string, versionNumber: number, input: TemplateInput) {
  return prisma.templateVersion.create({
    data: {
      templateId,
      versionNumber,
      name: input.name,
      description: input.description,
      category: input.category,
      scoringLabels: input.scoringLabels,
      domains: {
        create: input.domains.map((domain, domainIndex) => ({
          title: domain.title,
          description: domain.description,
          sortOrder: domainIndex,
          questions: {
            create: domain.questions.map((question, questionIndex) => ({
              prompt: question.prompt,
              guidance: question.guidance,
              sortOrder: questionIndex,
              levels: {
                create: question.levels.map((level, levelIndex) => ({
                  value: level.value,
                  label: level.label,
                  description: level.description,
                  sortOrder: levelIndex
                }))
              }
            }))
          }
        }))
      }
    },
    include: {
      domains: {
        include: {
          questions: {
            include: {
              levels: true
            }
          }
        }
      }
    }
  });
}

export async function createTemplate(input: TemplateInput) {
  const template = await prisma.assessmentTemplate.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      category: input.category
    }
  });

  const version = await createVersion(template.id, 1, input);
  return { template, version };
}

export async function updateTemplate(templateId: string, input: TemplateInput) {
  const template = await prisma.assessmentTemplate.update({
    where: { id: templateId },
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      category: input.category
    },
    include: {
      versions: {
        orderBy: {
          versionNumber: "desc"
        },
        take: 1
      }
    }
  });

  const nextVersionNumber = (template.versions[0]?.versionNumber ?? 0) + 1;
  const version = await createVersion(templateId, nextVersionNumber, input);
  return { template, version };
}

export async function deleteTemplate(templateId: string) {
  const usageCount = await prisma.assessmentRun.count({
    where: { templateId }
  });

  if (usageCount > 0) {
    throw new Error("This template is already used in assessment runs and cannot be removed.");
  }

  return prisma.assessmentTemplate.delete({
    where: { id: templateId }
  });
}
