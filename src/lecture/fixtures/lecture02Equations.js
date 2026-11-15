const math = String.raw;

// Keys are the original PDF page numbers, including the title slide.
export const lecture02Equations = {
  2: [{
    expression: math`J(\pi)=\sum_{t=1}^{T}\mathbb{E}_{s\sim d_\pi^t}\,\mathbb{E}_{a\sim\pi(\cdot\mid s)}[C(s,a)]`,
    explanation: 'Score a policy by the total cost it is expected to incur over a full rollout.',
    terms: [
      [math`\pi,\ \pi^*`, 'The policy being evaluated and the expert policy. A policy chooses actions given a state.'],
      [math`t,\ T`, 'The current step and the total number of steps in the rollout.'],
      [math`d_\pi^t`, 'The distribution of states reached at step t when following the policy.'],
      [math`\mathbb{E},\ C(s,a)`, 'Average over possible states and actions, using the cost of action a in state s.'],
    ],
  }],
  3: [{
    expression: math`\hat\pi=\arg\min_{\pi\in\Pi}\mathbb{E}_{s\sim D}[\ell(s,\pi)]`,
    explanation: 'Pick the policy that best matches the expert on the demonstration dataset.',
    terms: [
      [math`D,\ s\sim D`, 'The dataset contains states paired with expert actions. The average here uses states from that dataset.'],
      [math`\ell(s,\pi)`, 'A training loss that measures how far the predicted action is from the expert action in state s.'],
      [math`\arg\min_{\pi\in\Pi}`, 'Choose the lowest-loss policy from the class of policies the model can represent.'],
      [math`\hat\pi`, 'The resulting behavior-cloned policy.'],
    ],
  }],
  4: [{
    expression: math`d_{\pi^*}\neq d_{\hat\pi}`,
    explanation: 'An expert and a learner can see different states in the same environment. Once the learner takes a different action, its next state may be absent from the demonstrations.',
    terms: [
      [math`d_{\pi^*}`, 'The distribution of states the expert visits, averaged across the rollout.'],
      [math`d_{\hat\pi}`, 'The distribution of states the learned policy visits when it controls the rollout.'],
    ],
  }],
  6: [{
    expression: math`J(\hat\pi)\le J(\pi^*)+T^2\epsilon`,
    explanation: 'The bound compares the learner’s total cost with the expert’s. A mistake can affect all remaining steps, so doubling the horizon can quadruple the worst-case excess-cost bound.',
    terms: [
      [math`J(\hat\pi),\ J(\pi^*)`, 'Expected total cost of the learned policy and the expert over the same horizon. Lower is better.'],
      [math`\epsilon`, 'The learner’s per-step error rate on states visited by the expert.'],
      [math`T^2\epsilon`, 'Up to T chances to make a mistake, with up to T steps of consequences. This is an upper bound.'],
    ],
  }],
  9: [{
    expression: math`\pi_i=\beta_i\pi^*+(1-\beta_i)\hat\pi_i`,
    explanation: 'At each rollout step, pick the expert with probability βᵢ and the current learner otherwise. This mixes which policy acts at each step.',
    terms: [
      [math`i,\ \pi_i`, 'The training iteration and the mixed policy used to collect its rollout.'],
      [math`\pi^*,\ \hat\pi_i`, 'The expert policy and the learner trained so far.'],
      [math`\beta_i`, 'The probability that the expert acts. At 1 the expert controls every step, and at 0 the learner does.'],
    ],
  }, {
    expression: math`D\leftarrow D\cup D_i`,
    explanation: 'Ask the expert what it would do in the newly visited states. Keep those labels alongside past examples and retrain on the combined dataset.',
    terms: [
      [math`D,\ D_i`, 'The accumulated dataset and the new state–expert action pairs collected during iteration i.'],
      [math`\cup,\ \leftarrow`, 'Combine the old and new examples, then assign the result back to D.'],
    ],
  }],
  12: [{
    expression: math`\epsilon_N=\min_{\pi\in\Pi}\frac{1}{N}\sum_{i=1}^{N}\mathbb{E}_{s\sim d_{\pi_i}}[\ell(s,\pi)]`,
    explanation: 'Look across all the rollout distributions seen in training. How small could the average imitation loss be if you chose the best single policy in hindsight?',
    terms: [
      [math`N,\ d_{\pi_i}`, 'The number of training iterations and the state distribution visited by the rollout policy in round i.'],
      [math`\ell(s,\pi),\ \Pi`, 'The imitation loss on one state and the set of policies the model can represent.'],
    ],
  }, {
    expression: math`J(\hat\pi)\le J(\pi^*)+uT\epsilon_N+O(1)`,
    explanation: 'Under the DAgger assumptions on this slide, some returned policy has an excess-cost bound that grows linearly with the horizon when the cost of a single mistake stays bounded.',
    terms: [
      [math`u,\ T,\ \epsilon_N`, 'Worst single-mistake cost, rollout length, and the best average imitation loss from the equation above.'],
      [math`O(1)`, 'A bounded additive term in the guarantee under the slide’s assumptions.'],
    ],
  }],
  13: [{
    expression: math`u=\max_{a,t,s}\bigl[Q_{T-t+1}^{\pi^*}(s,a)-Q_{T-t+1}^{\pi^*}(s,\pi^*(s))\bigr]`,
    explanation: 'Take one wrong action, then let the expert take over. How much more does that cost than letting the expert act from the start? The largest gap is u.',
    terms: [
      [math`Q_{T-t+1}^{\pi^*}(s,a)`, 'Expected cost over the remaining steps if action a is taken first, then the expert takes over.'],
      [math`Q_{T-t+1}^{\pi^*}(s,\pi^*(s))`, 'Expected cost over the same steps if the expert also chooses the first action.'],
      [math`\max_{a,t,s}`, 'Find the largest gap over actions, timesteps and states.'],
      [math`u=O(1)\ \text{vs.}\ u=O(T)`, 'If the expert recovers quickly, the extra cost stays bounded. If one mistake affects the rest of the rollout, it can grow with T and bring back the quadratic bound.'],
    ],
  }],
};
