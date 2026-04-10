import "dotenv/config";
import { prisma } from "../src/db.js";
import { createTemplate } from "../src/lib/template-service.js";
async function main() {
    const teamNames = ["Platform Team", "Payments Team", "Mobile Team", "Data Team"];
    for (const name of teamNames) {
        await prisma.team.upsert({
            where: { name },
            update: {},
            create: { name }
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
