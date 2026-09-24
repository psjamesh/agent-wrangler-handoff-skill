export default {
  id: 'handoff',
  label: 'Handoff',
  description: 'Adds the `handoff` skill: a session that is stuck, needs a different agent provider, or is out of context hands its work to a fresh successor session it spawns itself.',
  author: 'psjamesh',
  homepage: 'https://github.com/psjamesh/agent-wrangler-handoff-skill',
  defaultEnabled: true,
  requires: [],
  skills: ['handoff'],
};
