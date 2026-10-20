import type { Person } from "@/components/teams/face";

/** The fixed people of the boards (design/teams/world.json). Photos are in public/design/teams/faces. */
const face = (file: string) => `/design/teams/faces/${file}.jpg`;

export const P = {
  rudo: { id: "rudo", name: "Rudo Mapfumo", photo: face("rudo") },
  kuda: { id: "kuda", name: "Kudakwashe Sibanda", photo: face("kuda") },
  tinashe: { id: "tinashe", name: "Tinashe Gumbo", photo: face("tinashe2") },
  precious: { id: "precious", name: "Dr Precious Mutasa", photo: face("precious") },
  nyasha: { id: "nyasha", name: "Nyasha Mlambo", photo: face("nyasha") },
  tendai: { id: "tendai", name: "Tendai Chari", photo: face("tendai") },
  blessing: { id: "blessing", name: "Blessing Dube", photo: face("blessing") },
  rumbidzai: { id: "rumbidzai", name: "Rumbidzai Moyo", photo: face("rumbidzai") },
  farai: { id: "farai", name: "Farai Chikwanha" },
  kudzai: { id: "kudzai", name: "Kudzai Ncube" },
  tatenda: { id: "tatenda", name: "Tatenda Chinyamakobvu" },
  sean: { id: "sean", name: "Sean Muchenje" },
  you: { id: "you", name: "You" },
} satisfies Record<string, Person>;
