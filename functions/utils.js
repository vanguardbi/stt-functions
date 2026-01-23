
export const TrackTemplates = {
    'Articulation': `
        ARTICULATION – CLINICAL NOTES
        Names: {name}
        Session Type: Face-to-face / Online (am/pm session)
        Date: {today}
        ---------------------------------------------------------------------------------------------------------------------
        S-
        Where did the session take place, and who accompanied the client? How did the client participate? Mention alertness, attention, motivation, and overall engagement. Note any concerns such as fatigue, illness, or emotional state.

        Session Objectives:
        {objectives}

        Articulation Targets and Activities
        For each objective above, provide detailed documentation following this structure:

        Target Sound: /___/
        Position: Initial / Medial / Final
        Phonetic Placement Focus: _________________________
        Cueing Method: Verbal / Visual / Tactile / Auditory

        Activity [number]: [Activity Name]
        Props: [List props used]
        - [Describe activity and approach]
        - [Note SLP modeling and client responses]

        Outcome:
        - Accuracy: ___ / 10 correct productions
        - [Specific observations about performance]
        - [Note any error patterns or cueing effectiveness]

        (Repeat for all objectives/activities)

        Observations
        - Note motivation, attention, and consistency across tasks
        - Mention any stimulability for other sounds or co-occurring phonological processes
        - Note if errors were consistent, inconsistent, or context-dependent

        Home Practice:
        - Practice recommendations with specific tasks
        - Caregiver guidance
        - Optional handout suggestions

        Next Session:
        {nextSessionPlans}

        Signed:
        _______________________________
    `,

    'Auditory Verbal Therapy': `
        AUDITORY VERBAL THERAPY – CLINICAL NOTES
        Names: {name}
        Session Type: Face-to-face / Online (am/pm session)
        Date: {today}
        ---------------------------------------------------------------------------------------------------------------------
        S-
        Where did the session take place, and who accompanied the child? How did the child participate? Note listening attention, responsiveness to sound, and general engagement. Mention any parental participation or observations relevant to the session.

        Session Objectives:
        {objectives}

        Listening Goals
        For each objective, identify the listening hierarchy level (Detection/Discrimination/Identification/Comprehension) and provide details:

        Goal [number]: [Listening Level]
        Props: [List props used]
        - [Describe activity and approach]
        - [Note acoustic highlighting, cueing methods]
        - [Client responses and parent coaching]

        Outcome:
        - [Measurable results with numbers/percentages]
        - [Note any challenges or supports needed]

        (Repeat for all listening objectives)

        Speech and Language Targets
        Goal [number]: [Speech Production/Expressive Language]
        Target: [Specific sounds/language structures]
        - [Activity description and approach]

        Outcome:
        - [Production accuracy and observations]

        Parent Coaching / Strategies Practiced
        - Auditory First: [How implemented]
        - Acoustic Highlighting: [Examples]
        - Auditory Sandwich: [Usage]
        - Sabotage Techniques: [Examples]
        - Wait Time: [Implementation]

        Observations
        - Note changes in attention, listening, or speech imitation
        - Record progress toward listening hierarchy levels
        - Mention device issues, listening checks, or parent engagement

        Home Practice:
        - Daily listening activities
        - Listening-first strategies for routines
        - Specific practice recommendations
        - Handout suggestions

        Next Session:
        {nextSessionPlans}

        Signed:
        _______________________________
    `,

    'Dysfluency': `
        STUTTERING – CLINICAL NOTES
        Names: {name}
        Session Type: Face-to-face / Online (am/pm session)
        Date: {today}
        ----------------------------------------------------------------------------------------------------------------------
        S-
        Where did the session take place, and who accompanied the client? How did the client participate? Note fluency, attention, and motivation. Mention if any prompts or breaks were required, or if the client appeared anxious, tired, or distracted.

        Session Objectives:
        {objectives}

        Fluency-Shaping / Stuttering Modification Activities
        For each activity(Identifying Stuttering Moments, Easy Onset / Stretchy Speech Practice, Cancellations / Pull-outs Practice), provide detailed documentation:

        Activity [number]: [Activity Name]
        Props: [List props used]
        - [Describe fluency strategy taught/practiced]
        - [SLP modeling and client practice]
        - [Note awareness and self-monitoring]

        Outcome:
        - [Success rate with numbers/percentages]
        - [Observations about tension, avoidance, self-correction]
        - [Note contexts where fluency improved or worsened]

        (Repeat for all activities)

        Observations
        - Note behavioral/emotional reactions to stuttering
        - Record fluency contexts that improved or worsened
        - Note any specific triggers or supports observed

        Home Practice:
        - Awareness activities
        - Fluency strategy practice
        - Family communication guidance
        - Optional handout suggestions

        Next Session:
        {nextSessionPlans}

        Signed:
        _______________________________
    `,

    'Language': `
        LANGUAGE – CLINICAL NOTES
        Names: {name}
        Session Type: Face-to-face / Online (am/pm session)
        Date: {today}
        ----------------------------------------------------------------------------------------------------------------------------
        S-
        Where did the session take place, and who accompanied client. How did the client participate? Did you offer prompts for participation. Include any other information eg. if the client looked unwell, etc.

        Session Objectives:
        {objectives}

        Language
        For each objective, identify the language area and provide details:

        [Language Area]: [Specific skill]
        Props: [List props used]
        - [Describe activity and approach]
        - [Note prompting levels and client responses]

        Outcome:
        - [Accuracy/success rate with specifics]
        - [Observations about support needed]
        - [Note any patterns or challenges]

        (Repeat for all objectives)

        Observations
        - Note down anything the client did that would inform prop/target selection in the next session
        - Note down any preferences in toys

        Home Practise:
        - Specific practice recommendations
        - Handouts: [List appropriate handouts]

        Next Session:
        {nextSessionPlans}

        Signed:
        _______________________________
    `,

    'Play Skills': `
        PLAY SKILLS – CLINICAL NOTES
        Names: {name}
        Session Type: Face-to-face / Online (am/pm session)
        Date: {today}
        ----------------------------------------------------------------------------------------------------------------------------
        S-
        Where did the session take place, and who accompanied client. How did the client participate? Did you offer prompts for participation. Include any other information eg. if the client looked unwell, etc.

        Session Objectives:
        {objectives}

        Play Skills
        For each play activity (eg Hide and Seek, Pop Up Pirate, Performatives, Shopping Game, Pretend Play Trains), provide detailed documentation:

        [Play Activity Name]
        Props: [List props used]
        - [Describe play activity and rules]
        - [Note modeling and client participation]
        - [Phrases/skills reinforced]

        Outcome:
        - [Observations about compliance, engagement, skill demonstration]
        - [Note any challenges with rules, turn-taking, etc.]

        (Repeat for all activities)

        Observations
        - Note down anything the client did that would inform prop/target selection in the next session
        - Note down any preferences in toys

        Home Practise:
        - Play activity recommendations
        - Turn-taking and rule-following guidance
        - Handouts: [List appropriate handouts]

        Next Session:
        {nextSessionPlans}

        Signed:
        _______________________________
    `,

    'Preverbal Skills': `
        PREVERBAL SKILLS – CLINICAL NOTES
        Names: {name}
        Session Type: Face-to-face / Online (am/pm session)
        Date: {today}
        ----------------------------------------------------------------------------------------------------------------------------
        S-
        Where did the session take place, and who accompanied client. How did the client participate? Did you offer prompts for participation. Include any other information eg. if the client looked unwell, etc.

        Session Objectives:
        {objectives}

        Pre-Verbal Skills
        For each activity, provide detailed documentation:

        [Skill Area] (e.g Copying animal sounds, Copying ah and mm, Nursery Rhymes like Wheels on the Bus)
        Other Targets: [List co-occurring targets] (e.g., Eye Contact, Joint Attention, Turn-taking)
        Props: [List props used]
        - [Describe activity and approach]
        - [Note modeling and prompting strategies]
        - [Client responses and engagement]

        Outcome:
        - [Success rate: X/Y attempts]
        - [Specific observations about performance]
        - [Note any modifications that helped]

        (Repeat for all activities)

        Observations
        - Note down anything the client did that would inform prop/target selection in the next session
        - Note down any preferences in toys

        Home Practise:
        - Handouts: [List appropriate handouts]

        Next Session:
        {nextSessionPlans}

        Signed:
        _______________________________
    `,

    'General': `
        Clinical Notes
        Names: {name}
        Session Type: Face-to-face / Online (am/pm session)
        Date: {today}
        --------------------------------------------------------------------------------------------------------------------------
        S- Describe where the session took place, who accompanied the client, how they participated, and any contextual notes (e.g., mood, health, attention).

        Session Objectives:
        {tracksAndObjectives}

        For each objective above, expand details as follows:

        Domain: [One of: Language / Articulation / Play Skills / Preverbal Skills / Auditory Verbal Therapy /Dysfluency / Other]
        Objective [number]: [restate and expand on the objective task or activity]
        - Objective details: props, cues, tasks used, client responses
        Outcome:
        - Measurable results or progress observed

        (Repeat for all objectives of that domain)

        Observations
        - Note observations that inform future prop/target selection.

        Home Practise:
        - Include assigned home tasks and rationale.

        Next Session:
        {nextSessionPlans}

        Signed:
        _______________________________
    `
};
