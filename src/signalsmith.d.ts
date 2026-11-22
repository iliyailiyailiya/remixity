// signalsmith-stretch ships without types; this is the part we use.
declare module 'signalsmith-stretch' {
  const SignalsmithStretch: (context: BaseAudioContext, options?: AudioWorkletNodeOptions) => Promise<AudioWorkletNode>;
  export default SignalsmithStretch;
}
