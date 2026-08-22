export const CREATOR_GENRES=[
'MMO','RPG','Action','Adventure','Shooter','FPS','Battle Royale','MOBA','Strategy','Simulation','Survival','Horror','Sports','Racing','Fighting','Platformer','Puzzle','Rhythm','Card & Board','Sandbox','Crafting','Co-op','Party','Retro','Indie','Creative','Music','Art','Just Chatting','IRL'
];
export const GENRE_ALIASES={
'Massively Multiplayer':'MMO','Massively Multiplayer Online':'MMO','MMORPG':'MMO',
'Role-playing (RPG)':'RPG','Role-playing':'RPG','First person shooter':'FPS',
'Real Time Strategy (RTS)':'Strategy','Turn-based strategy (TBS)':'Strategy',
'Simulator':'Simulation','Hack and slash/Beat em up':'Action','Point-and-click':'Adventure'
};
export function normalizeGenre(name){return GENRE_ALIASES[name]||name}
export function genreOptions(selected=''){return ['All genres',...CREATOR_GENRES].map(x=>`<option value="${x==='All genres'?'':x}"${x===selected?' selected':''}>${x}</option>`).join('')}
