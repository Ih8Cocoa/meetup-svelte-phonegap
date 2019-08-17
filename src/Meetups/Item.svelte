<script>
	import { createEventDispatcher } from "svelte";
	import Button from "../UI/Button.svelte";
	import Badge from "../UI/Badge.svelte";
	import Spinner from '../UI/Spinner.svelte';
	import meetups from "../stores/meetups";

	export let title;
	export let id;
	export let subtitle;
	export let imageUrl;
	export let description;
	export let address;
	export let contactEmail;
	export let isFavorite = false;

	let isLoading = false;

	const dispatch = createEventDispatcher();

	function toggleFavorite() {
		isLoading = true;
		fetch(`https://svelte-test-store.firebaseio.com/meetups/${id}.json`, {
				method: 'PATCH',
				body: JSON.stringify({isFavorite: !isFavorite}),
				headers: { 'Content-Type': 'application/json' }
			})
			.then(res => {
				if (!res.ok) {
					throw new Error("Can't change fav status")
				}
				meetups.toggleFavorite(id);
			})
			.catch(console.error)
			.finally(() => {
				isLoading = false
			})
	}

	function showDetails() {
		dispatch("showdetails", id);
	}

	function edit() {
		dispatch("edit", id);
	}
</script>

<style>
	article {
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.26);
		border-radius: 5px;
		background: white;
		margin: 1rem;
	}

	header,
	.content,
	footer {
		padding: 1rem;
	}

	.image {
		width: 100%;
		height: 14rem;
	}

	.image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	h1 {
		font-size: 1.25rem;
		margin: 0.5rem 0;
		font-family: "Roboto Slab", sans-serif;
	}

	h2 {
		font-size: 1rem;
		color: #808080;
		margin: 0.5rem 0;
	}

	p {
		font-size: 1.25rem;
		margin: 0;
	}

	div {
		text-align: right;
	}

	.content {
		height: 4rem;
	}
</style>

<article>
	<header>
		<h1>
			{title}
			{#if isFavorite}
				<Badge>FAVORITE</Badge>
			{/if}
		</h1>
		<h2>{subtitle}</h2>
		<p>{address}</p>
	</header>
	<div class="image">
		<img src={imageUrl} alt="alt image for {title}" />
	</div>
	<div class="content">
		<p>{description}</p>
	</div>
	<footer>
		<Button mode="outline" on:click={edit}>Edit</Button>
		<Button href="mailto:{contactEmail}">Contact me</Button>
		<Button
			mode="outline"
			disabled={isLoading}
			color={isFavorite ? '' : 'success'}
			on:click={toggleFavorite}>
			{isFavorite ? 'Unf' : 'F'}avorite
		</Button>
		<Button on:click={showDetails}>Details</Button>
	</footer>
</article>
