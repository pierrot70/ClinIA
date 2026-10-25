import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import TreatmentDetails from "./TreatmentDetails";

describe("TreatmentDetails", () => {
    it.each([
        { details: " Source details ", summary: "Summary", justification: "Rationale", indication: "Indication", expected: " Source details " },
        { details: " \t", summary: " Source summary ", justification: "Rationale", indication: "Indication", expected: " Source summary " },
        { details: "", summary: "", justification: " Source rationale ", indication: "Indication", expected: " Source rationale " },
        { details: "", summary: " ", justification: "\t", indication: " Source indication ", expected: " Source indication " },
    ])("selects the first nonempty explanation without modifying it: $expected", fields => {
        render(<MemoryRouter initialEntries={[{ pathname: "/treatment/source-option", state: {
            treatment: { id: "source-option", name: "Source option", ...fields },
        } }]}><Routes><Route path="/treatment/:id" element={<TreatmentDetails />} /></Routes></MemoryRouter>);
        const explanation = screen.getByText(fields.expected.trim());
        expect(explanation.textContent).toBe(fields.expected);
        expect(explanation).toHaveAttribute("translate", "no");
    });

    it("uses treatment state passed from the clinical card", () => {
        render(
            <MemoryRouter
                initialEntries={[
                    {
                        pathname: "/treatment/glp1",
                        state: {
                            sourceMode: "real",
                            realAI: true,
                            treatment: {
                                id: "glp1",
                                name: "Option GLP-1",
                                class: "Traitement",
                                summary: "Option a discuter selon le profil.",
                                evidence_level: "A",
                                monitoring: ["Surveiller la tolerance digestive"],
                                contraindications: ["Pancreatite active"],
                            },
                        },
                    } as never,
                ]}
            >
                <Routes>
                    <Route path="/treatment/:id" element={<TreatmentDetails />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getAllByText("Reponse OpenAI reelle")).toHaveLength(2);
        expect(screen.getByText("Option GLP-1")).toBeInTheDocument();
        expect(screen.getByText("Pertinence clinique elevee")).toBeInTheDocument();
        expect(screen.getByText("Pancreatite active")).toBeInTheDocument();
    });
});

it("does not interpret missing treatment precautions as standard surveillance or no clinical risk", () => {
    render(<MemoryRouter initialEntries={[{ pathname: "/treatment/unscoped", state: {
        treatment: { id: "unscoped", name: "Synthetic unscoped option", contraindications: [], monitoring: [] },
    } }]}><Routes><Route path="/treatment/:id" element={<TreatmentDetails />} /></Routes></MemoryRouter>);
    expect(screen.getByText("Non renseigné")).toBeInTheDocument();
    expect(screen.queryByText("Surveillance standard")).not.toBeInTheDocument();
    expect(screen.getByText("Aucune contre-indication detaillee fournie.")).toBeInTheDocument();
    expect(screen.getAllByText("Aucun point de surveillance detaille fourni.").length).toBeGreaterThan(0);
});

describe("confirmed clinical provenance", () => {
    it.each([
        { cacheHit: true, realAI: true },
        { cacheHit: true, realAI: false },
        { cacheHit: false, realAI: true },
        { cacheHit: false, realAI: false },
        { cacheHit: undefined, realAI: false },
    ])("uses response cache status independently from the real-AI request setting: %j", ({ cacheHit, realAI }) => {
        render(<MemoryRouter initialEntries={[{ pathname: "/treatment/synthetic", state: {
            treatment: { id: "synthetic", name: "Synthetic option" }, sourceMode: "real", cacheHit, realAI,
        } }]}><Routes><Route path="/treatment/:id" element={<TreatmentDetails />} /></Routes></MemoryRouter>);
        expect(screen.getAllByText("Reponse OpenAI reelle")).toHaveLength(2);
        expect(screen.queryByText("Réponse réutilisée depuis le cache.") !== null).toBe(cacheHit === true);
        expect(screen.queryByText("Reponse OpenAI reelle mise en cache")).not.toBeInTheDocument();
    });
    it("reports unknown provenance without claiming generation or OpenAI origin", () => {
        render(<MemoryRouter initialEntries={[{ pathname: "/treatment/synthetic", state: {
            treatment: { id: "synthetic", name: "Synthetic option" }, realAI: true, cacheHit: true,
        } }]}><Routes><Route path="/treatment/:id" element={<TreatmentDetails />} /></Routes></MemoryRouter>);
        expect(screen.getAllByText("Provenance non renseignée")).toHaveLength(2);
        expect(screen.getByText("Réponse réutilisée depuis le cache.")).toBeInTheDocument();
        expect(screen.queryByText("Contexte clinique genere")).not.toBeInTheDocument();
    });
});

it("shows every distinct authored detail and retains option-scoped source references", () => {
    const fields={id:"authored",name:"Authored option",details:"Original details",summary:"Original summary",justification:"Original rationale",indication:"Original indication",source_fields:{references:[{name:"Authored source",url:"https://example.test"}]}};
    render(<MemoryRouter initialEntries={[{pathname:"/treatment/authored",state:{treatment:fields,sourceMode:"real"}}]}><Routes><Route path="/treatment/:id" element={<TreatmentDetails/>}/></Routes></MemoryRouter>);
    for(const text of [fields.details,fields.summary,fields.justification,fields.indication]) expect(screen.getByText(text)).toHaveAttribute("translate","no");
    expect(screen.getByText(/Authored source/)).toHaveAttribute("translate","no");
});
it("does not present a category-only legacy indication as a complete explanation", () => {
    render(<MemoryRouter initialEntries={[{pathname:"/treatment/legacy",state:{treatment:{id:"legacy",name:"Legacy option",indication:"Pharmacologic treatment",evidence_level:"A"},sourceMode:"real",cacheHit:true}}]}><Routes><Route path="/treatment/:id" element={<TreatmentDetails/>}/></Routes></MemoryRouter>);
    expect(screen.getByText("Aucun detail supplementaire fourni pour cette option.")).toBeInTheDocument();
    expect(screen.queryByText("Pertinence clinique elevee")).not.toBeInTheDocument();
});
it("labels a directly linked static example as simulated even when stale navigation metadata says real", () => {
    render(<MemoryRouter initialEntries={[{pathname:"/treatment/amlodipine",state:{sourceMode:"real",cacheHit:true}}]}><Routes><Route path="/treatment/:id" element={<TreatmentDetails/>}/></Routes></MemoryRouter>);
    expect(screen.getAllByText("Donnees simulees")).toHaveLength(2);
    expect(screen.queryByText("Reponse OpenAI reelle")).not.toBeInTheDocument();
    expect(screen.queryByText("Réponse réutilisée depuis le cache.")).not.toBeInTheDocument();
});
