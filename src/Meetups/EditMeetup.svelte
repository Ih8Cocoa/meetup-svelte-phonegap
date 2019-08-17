<script>
	import { createEventDispatcher } from "svelte";
	import meetups from "../stores/meetups";
	import TextInput from "../UI/TextInput.svelte";
	import Button from "../UI/Button.svelte";
	import Modal from "../UI/Modal.svelte";
	import { isEmpty, isEmail } from "../helpers/validation";

	export let id = null;

	let meetup = {
		title: "",
		subtitle: "",
		contactEmail: "",
		address: "",
		description: "",
		imageUrl: ""
	};

	if (id) {
		// double call to unsub immediately
		meetups.subscribe(items => {
			meetup = items.find(i => i.id === id);
		})();
	}

	// validation deductions
	$: validTitle = !isEmpty(meetup.title);
	$: validSubtitle = !isEmpty(meetup.subtitle);
	$: validAddress = !isEmpty(meetup.address);
	$: validDescription = !isEmpty(meetup.description);
	$: validImage = !isEmpty(meetup.imageUrl);
	$: validEmail = isEmail(meetup.contactEmail);
	$: validForm =
		validTitle &&
		validSubtitle &&
		validAddress & validDescription &&
		validImage &&
		validEmail;

	const dispatch = createEventDispatcher();

	function close() {
		dispatch("close");
	}

	function submit() {
		if (id) {
			fetch(`https://svelte-test-store.firebaseio.com/meetups/${id}.json`, {
				method: 'PATCH',
				// make a copy of the object without the ID attribute
				body: JSON.stringify({...meetup, id: undefined}),
				headers: { 'Content-Type': 'application/json' }
			})
				.then(res => {
					if (!res.ok) {
						throw new Error('oops');
					}
					meetups.editMeetup(id, meetup);
				})
				.catch(console.error)
		} else {
			const meetupWithFav = {...meetup, isFavorite: false}
			fetch('https://svelte-test-store.firebaseio.com/meetups.json', {
				method: 'POST',
				body: JSON.stringify(meetupWithFav),
				headers: { 'Content-Type': 'application/json' }
			})
			.then(res => {
				if (!res.ok) {
					throw new Error('Failed');
				}
				return res.json();
			})
			.then(json => meetups.newMeetup({...meetupWithFav, id: json.name}))
			.catch(console.error)
			
		}
		close();
	}

	function deleteMeetup() {
		fetch(`https://svelte-test-store.firebaseio.com/meetups/${id}.json`, {
				method: 'DELETE'
			})
			.then(res => {
				if (!res.ok) {
					throw new Error("Can't delete")
				}
				meetups.removeMeetup(id);
			})
			.catch(console.error)
		close();
	}
</script>

<style>
	form {
		width: 100%;
	}
</style>

<Modal title="Edit Meetup" on:close>
	<!-- Form shit -->
	<form on:submit|preventDefault={submit}>
		<TextInput
			id="title"
			label="Title"
			bind:value={meetup.title}
			isValid={validTitle} />
		<TextInput
			id="subtitle"
			label="Subtitle"
			bind:value={meetup.subtitle}
			isValid={validSubtitle} />
		<TextInput
			id="address"
			label="Address"
			bind:value={meetup.address}
			isValid={validAddress} />
		<TextInput
			id="imageUrl"
			label="Image URL"
			bind:value={meetup.imageUrl}
			isValid={validImage} />
		<TextInput
			inputType="email"
			id="email"
			label="Email"
			bind:value={meetup.contactEmail}
			isValid={validEmail}
			errorMessage="Please enter a valid email address" />
		<TextInput
			inputType="textarea"
			rows="3"
			id="description"
			label="Description"
			bind:value={meetup.description}
			isValid={validDescription} />
	</form>
	<div slot="footer">
		<Button mode="outline" on:click={close}>Cancel</Button>
		<Button on:click={submit} disabled={!validForm}>Save</Button>
		{#if id}
			<Button on:click={deleteMeetup}>Delete</Button>
		{/if}
	</div>
</Modal>
