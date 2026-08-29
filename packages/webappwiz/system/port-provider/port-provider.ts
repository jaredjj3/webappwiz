/**
 * PortProvider is the seam that answers which port to listen on. Typically,
 * this is assigned the variable name `ports`.
 *
 * Ask for the port you would rather have and use what comes back: a server
 * keeps a predictable URL when it can, and still starts when a second copy of
 * it, or anything else, already holds that port. The port is worth asking for
 * even when this process is not the one binding it, which is the case for a
 * database or any other server started as a subprocess.
 */
export interface PortProvider {
	/**
	 * The first open port at or after `from`, which is `from` itself when it is
	 * free. Pass 0 to say any port will do: 0 comes back, and whatever binds it
	 * is what chooses.
	 */
	get(from: number): Promise<number>;
}
