import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeI18nContext } from "../contexts/HomeI18nContext";
import { UI_LABELS_FR } from "../i18n/uiLabels.fr";
import { PatientsPage } from "./PatientsPage";
const state=vi.hoisted(()=>({user:{id:"synthetic-ips",role:"IPS"},list:vi.fn(),archive:vi.fn(),restore:vi.fn(),support:vi.fn()}));
vi.mock("../hooks/useAuth",()=>({useAuth:()=>({user:state.user,isAuthenticated:true})}));
vi.mock("../services/patientsApi",async importOriginal=>({...await importOriginal<object>(),fetchPatientsPaginated:state.list,archivePatient:state.archive,restorePatient:state.restore}));
vi.mock("../services/clinicalSupportAccessApi",()=>({listPhysicianClinicalSupportRequestStatuses:state.support,createPhysicianClinicalSupportRequest:vi.fn()}));
vi.mock("../components/clinical/OwnerCareSharing",()=>({OwnerCareSharing:({patient}:{patient:{_id:string}|null})=>patient?<div data-testid="sharing-patient">{patient._id}</div>:null}));
const patient={_id:"synthetic-patient",nom:"Test",prenom:"Fictif",num_assurance_maladie:"",ownerUserId:"synthetic-ips"};
function Page(){return <MemoryRouter><HomeI18nContext.Provider value={{locale:"fr-CA"} as React.ContextType<typeof HomeI18nContext>}><PatientsPage/></HomeI18nContext.Provider></MemoryRouter>;}
const copy=UI_LABELS_FR.patientsPage;
beforeEach(()=>{vi.clearAllMocks();state.user={id:"synthetic-ips",role:"IPS"};state.list.mockResolvedValue({data:{data:[patient],meta:{page:1,limit:10,total:1,totalPages:1}},meta:{source:"real",model:"unknown"}});state.support.mockResolvedValue({data:[]});vi.stubGlobal("matchMedia",vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("IPS own-patient sharing integration",()=>{
 it("exposes sharing from the list owner DTO on desktop and expanded mobile without archive actions",async()=>{
   render(<Page/>);await screen.findByRole("button",{name:UI_LABELS_FR.clinicalCareAccess.manage});
   fireEvent.click(screen.getByRole("button",{name:new RegExp(copy.cards.expand)}));
   const buttons=screen.getAllByRole("button",{name:UI_LABELS_FR.clinicalCareAccess.manage});expect(buttons).toHaveLength(2);
   fireEvent.click(buttons[0]);expect(screen.getByTestId("sharing-patient")).toHaveTextContent(patient._id);
   expect(screen.queryByRole("button",{name:copy.tabs.archived})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:copy.table.archive})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:copy.table.restore})).not.toBeInTheDocument();
   expect(state.list).toHaveBeenCalledWith(expect.objectContaining({archiveStatus:"active"}));expect(state.archive).not.toHaveBeenCalled();expect(state.restore).not.toHaveBeenCalled();expect(state.support).not.toHaveBeenCalled();
 });
 it.each([{ownerUserId:"other-owner"},{ownerUserId:undefined},{ownerUserId:"synthetic-ips",archivedAt:"2030-01-01T00:00:00Z"}])("keeps sharing hidden for foreign, missing owner or archived DTO %j",async fields=>{state.list.mockResolvedValue({data:{data:[{...patient,...fields}],meta:{page:1,total:1,totalPages:1}}});render(<Page/>);await screen.findAllByRole("button",{name:copy.table.edit});fireEvent.click(screen.getByRole("button",{name:new RegExp(copy.cards.expand)}));expect(screen.queryByRole("button",{name:UI_LABELS_FR.clinicalCareAccess.manage})).not.toBeInTheDocument();expect(screen.queryByTestId("sharing-patient")).not.toBeInTheDocument();});
 it("does not expose IPS owner sharing to a physician and preserves that role’s existing archive controls",async()=>{state.user={id:"synthetic-ips",role:"MEDECIN"};render(<Page/>);await screen.findAllByRole("button",{name:copy.table.edit});expect(screen.queryByRole("button",{name:UI_LABELS_FR.clinicalCareAccess.manage})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:copy.tabs.archived})).toBeVisible();expect(screen.getByRole("button",{name:copy.table.archive})).toBeVisible();});
 it("returns to active records if an existing archive view becomes an IPS session",async()=>{state.user={id:"synthetic-admin",role:"ADMIN"};const view=render(<Page/>);await screen.findAllByRole("button",{name:copy.table.edit});fireEvent.click(screen.getByRole("button",{name:copy.tabs.archived}));await waitFor(()=>expect(state.list).toHaveBeenLastCalledWith(expect.objectContaining({archiveStatus:"archived"})));state.user={id:"synthetic-ips",role:"IPS"};view.rerender(<Page/>);await waitFor(()=>expect(state.list).toHaveBeenLastCalledWith(expect.objectContaining({archiveStatus:"active"})));expect(screen.queryByRole("button",{name:copy.tabs.archived})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:copy.table.restore})).not.toBeInTheDocument();});
});
