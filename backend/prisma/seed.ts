import "../src/env.js";
import { prisma } from "../src/db.js";
import { hashPassword } from "../src/lib/auth.js";
import { createTemplate } from "../src/lib/template-service.js";

async function main() {
  const adminUser = await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      displayName: "Platform Administrator",
      role: "ADMIN",
      isActive: true
    },
    create: {
      displayName: "Platform Administrator",
      username: "admin",
      role: "ADMIN",
      isActive: true,
      passwordHash: hashPassword("admin")
    }
  });

  const teams = [
    { name: "Platform Team", description: "Owns shared platform capabilities and internal enablement." },
    { name: "Payments Team", description: "Builds and operates payment processing capabilities." },
    { name: "Mobile Team", description: "Owns the mobile client experience and release cadence." },
    { name: "Data Team", description: "Supports analytics, pipelines, and reporting workflows." }
  ];

  for (const team of teams) {
    await prisma.team.upsert({
      where: { name: team.name },
      update: {
        description: team.description
      },
      create: team
    });
  }

  const platformTeam = await prisma.team.findUnique({
    where: { name: "Platform Team" }
  });

  if (platformTeam) {
    await prisma.userTeamMembership.upsert({
      where: {
        userId_teamId: {
          userId: adminUser.id,
          teamId: platformTeam.id
        }
      },
      update: {
        membershipRole: "LEAD"
      },
      create: {
        userId: adminUser.id,
        teamId: platformTeam.id,
        membershipRole: "LEAD"
      }
    });
  }

  const categories = [
    { name: "Engineering", description: "Engineering effectiveness, quality, and delivery maturity." },
    { name: "Agile", description: "Team process, flow, and agile practice maturity." },
    { name: "Security", description: "Security readiness, controls, and operational hygiene." },
    { name: "BCM", description: "Business continuity and resilience capabilities." }
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {
        description: category.description
      },
      create: category
    });
  }

  const existingTemplate = await prisma.assessmentTemplate.findUnique({
    where: { slug: "engineering-maturity" }
  });

  if (!existingTemplate) {
    await createTemplate({
      name: "Engineering Maturity Assessment",
      slug: "engineering-maturity",
      description: "Baseline engineering maturity review across delivery, quality, and operational readiness.",
      category: "Engineering",
      scoringLabels: ["Initial", "Developing", "Intermediate", "Advanced", "Optimized"],
      domains: [
        {
          title: "Monitoring & Metrics",
          questions: [
            {
              prompt: "Are BCM-related metrics collected and used for improvement (e.g. RTO, MTTR)?",
              levels: [
                { value: 1, label: "Initial", description: "Metrics not collected" },
                { value: 2, label: "Developing", description: "Partially collected by few teams" },
                { value: 3, label: "Intermediate", description: "Collected regularly" },
                { value: 4, label: "Advanced", description: "Reviewed collectively" },
                { value: 5, label: "Optimized", description: "Integrated into dashboards and used for improvement" }
              ]
            }
          ]
        },
        {
          title: "Documentation",
          questions: [
            {
              prompt: "How complete and current is critical technical documentation?",
              guidance: "Consider playbooks, recovery procedures, service mapping, and ownership.",
              levels: [
                { value: 1, label: "Initial", description: "Not available" },
                { value: 2, label: "Developing", description: "Partial documents" },
                { value: 3, label: "Intermediate", description: "Documented for critical systems" },
                { value: 4, label: "Advanced", description: "Reviewed periodically and gaps tracked" },
                { value: 5, label: "Optimized", description: "Versioned, tested, and part of regular operations" }
              ]
            }
          ]
        }
      ]
    });
  }

  const existingQuestionLibrary = await prisma.questionLibraryItem.count();
  if (existingQuestionLibrary === 0) {
    await prisma.questionLibraryItem.createMany({
      data: [
        {
          title: "Requirements quality",
          prompt: "How consistently are business and product requirements written, reviewed, and maintained?",
          guidance: "Look at clarity, acceptance criteria, ownership, and update cadence.",
          levels: [
            { value: 1, label: "Initial", description: "Requirements are informal or missing" },
            { value: 2, label: "Developing", description: "Some teams document requirements inconsistently" },
            { value: 3, label: "Intermediate", description: "Most work has documented requirements with basic review" },
            { value: 4, label: "Advanced", description: "Requirements are structured, reviewed, and traceable" },
            { value: 5, label: "Optimized", description: "Requirements are measured, reusable, and continuously improved" }
          ]
        },
        {
          title: "Operational metrics",
          prompt: "Are service health and delivery metrics collected and used for improvement?",
          guidance: "Examples include reliability, lead time, deployment frequency, MTTR, and team health signals.",
          levels: [
            { value: 1, label: "Initial", description: "Metrics are not collected" },
            { value: 2, label: "Developing", description: "Some metrics exist for a few teams" },
            { value: 3, label: "Intermediate", description: "Metrics are collected regularly and visible" },
            { value: 4, label: "Advanced", description: "Metrics are reviewed and influence decisions" },
            { value: 5, label: "Optimized", description: "Metrics are embedded in team improvement loops" }
          ]
        }
      ]
    });
  }

  const existingDomainLibrary = await prisma.domainLibraryItem.count();
  if (existingDomainLibrary === 0) {
    await prisma.domainLibraryItem.createMany({
      data: [
        {
          title: "Business Requirements",
          description: "How well the team captures and manages the intent behind work.",
          questions: [
            {
              title: "Requirements quality",
              prompt: "How consistently are business and product requirements written, reviewed, and maintained?",
              guidance: "Look at clarity, acceptance criteria, ownership, and update cadence.",
              levels: [
                { value: 1, label: "Initial", description: "Requirements are informal or missing" },
                { value: 2, label: "Developing", description: "Some teams document requirements inconsistently" },
                { value: 3, label: "Intermediate", description: "Most work has documented requirements with basic review" },
                { value: 4, label: "Advanced", description: "Requirements are structured, reviewed, and traceable" },
                { value: 5, label: "Optimized", description: "Requirements are measured, reusable, and continuously improved" }
              ]
            }
          ]
        },
        {
          title: "Monitoring & Metrics",
          description: "How effectively the team measures reliability and improvement.",
          questions: [
            {
              title: "Operational metrics",
              prompt: "Are service health and delivery metrics collected and used for improvement?",
              guidance: "Examples include reliability, lead time, deployment frequency, MTTR, and team health signals.",
              levels: [
                { value: 1, label: "Initial", description: "Metrics are not collected" },
                { value: 2, label: "Developing", description: "Some metrics exist for a few teams" },
                { value: 3, label: "Intermediate", description: "Metrics are collected regularly and visible" },
                { value: 4, label: "Advanced", description: "Metrics are reviewed and influence decisions" },
                { value: 5, label: "Optimized", description: "Metrics are embedded in team improvement loops" }
              ]
            }
          ]
        }
      ]
    });
  }

  console.log("Seed completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
